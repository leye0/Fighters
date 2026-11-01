#!/usr/bin/env node
/**
 * Browser QA with real Chrome WebGL via software SwiftShader.
 * Verifies both supplied characters and motion playback; captures real canvas frames.
 * Tests hold-to-move using wall-clock time on software-rendered WebGL.
 * No puppeteer/playwright dependency.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const target = process.env.FIGHTERS_URL || 'http://127.0.0.1:8000/';
const results = 'captures';
mkdirSync(results,{recursive:true});
const profile = mkdtempSync(join(tmpdir(),'fighters-chrome-'));
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl',
  '--hide-scrollbars','--window-size=1365,900','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
let socket;
let nextId=0;
const pending = new Map();
function fail(message){throw Error(message);}
async function connect(){
  const portFile=join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!existsSync(portFile);i++) await delay(200);
  if(!existsSync(portFile))fail('Chrome DevTools port not created');
  const port=Number(readFileSync(portFile,'utf8').split('\n')[0]);
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(p=>p.type==='page');
  if(!page)fail('Missing Chrome page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage = event => {
    const message=JSON.parse(event.data);
    if(!message.id)return;
    const task=pending.get(message.id);
    if(!task)return;
    pending.delete(message.id);
    message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);
  };
}
function call(method, params={}){
  const id=++nextId;
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
}
async function evaluate(expression){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)fail('Page evaluate exception: '+r.exceptionDetails.text);
  return r.result.value;
}
async function waitUntil(test,label,limitMs=75000){
  const end=Date.now()+limitMs;
  while(Date.now()<end){
    const state=await evaluate(test);
    if(state===true)return;
    if(typeof state==='string' && state.startsWith('ERROR:'))fail(label+' '+state);
    await delay(650);
  }
  fail('Timeout: '+label+' / '+JSON.stringify(await evaluate("({title:document.getElementById('overlay-title')?.textContent,detail:document.getElementById('overlay-desc')?.textContent,ready:window.__fightersQA?.snapshot()?.ready,button:document.getElementById('start')?.textContent,renderer:!!document.querySelector('#viewport canvas')})")));
}
async function snap(name){
  const box=await evaluate("(()=>{const x=(document.getElementById('stage')||document.getElementById('viewport')).getBoundingClientRect();return {x:x.left,y:x.top,width:x.width,height:x.height};})()");
  const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{...box,scale:1}});
  const bytes=Buffer.from(r.data,'base64');
  writeFileSync(join(results,name+'.png'),bytes);
  return createHash('sha256').update(bytes).digest('hex');
}
async function selectClip(name){
  const result=await evaluate("(()=>{const a=[...document.querySelectorAll('.motion')].find(b=>b.textContent.includes("+JSON.stringify(name)+"));if(a){a.click();return true;}return false;})()");
  if(!result)fail('Motion button not found: '+name);
  const confirmed=await evaluate("document.getElementById('current-motion').textContent.includes("+JSON.stringify(name)+")");
  if(!confirmed)fail('Motion did not activate: '+name);
}
async function character(label, click=false){
  if(click)await evaluate("document.querySelector('[data-character=\"female\"]').click()");
  await waitUntil("(()=>{const s=document.getElementById('load-status').textContent;return s.startsWith('Erreur')?'ERROR:'+s:document.getElementById('clip-stat').textContent==='86' && document.getElementById('character-label').textContent==="+JSON.stringify(label)+" && document.getElementById('play-pause').disabled===false})()",label);
  await evaluate("document.querySelector('[data-filter=\"combat\"]').click()");
  await waitUntil("document.querySelectorAll('.motion').length>5",label+' combat filter');
  await selectClip('Punch Cross');
  await delay(350);
  const punch=await snap(label+'-punch');
  const playback=await evaluate("document.getElementById('scrub').value");
  if(Number(playback)<=0)fail(label+' animation timeline did not advance');
  await evaluate("document.querySelector('[data-filter=\"move\"]').click()");
  await selectClip('Walk Loop');
  await delay(700);
  await snap(label+'-walk');
  console.log(label+' PASS: 86 clips, combat and locomotion controls, advancing animation; punch screenshot '+punch);
}
try{
  await connect();
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1365,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:target});
  await waitUntil("document.readyState==='complete'",'initial page');
  const webgl=await evaluate("!!document.querySelector('#stage canvas')");
  if(!webgl)fail('No WebGL canvas');
  await character('SUPERHERO_MALE');
  await character('SUPERHERO_FEMALE',true);
  console.log('Character Motion Lab PASS');
  await call('Page.navigate',{url:'http://127.0.0.1:8000/?qa=1'});
  await waitUntil("(()=>{const title=document.getElementById('overlay-title')?.textContent;if(title==='Erreur de chargement')return 'ERROR: '+document.getElementById('overlay-desc')?.textContent;return !!window.__fightersQA&&window.__fightersQA.snapshot().ready===true;})()",'game models',100000);
  const initial=await evaluate("window.__fightersQA.snapshot()");
  if(initial.enemies!==3||initial.health!==100)fail('Game initial state incorrect '+JSON.stringify(initial));
  if(initial.outfit?.garmentMeshes!==4||initial.outfit?.hairMeshes!==1||
     initial.outfit?.headTriangles<20||initial.enemyOutfits?.some(o=>o.garmentMeshes<4||o.hairMeshes!==1))
    fail('Civilian clothing/hair not bound to all actors '+JSON.stringify(initial));
  console.log('COSTUMES PASS: civilian Peasant outfits, hair and isolated head, matching 65-joint bindings');
  // Native Quaternius Sword_Attack, the authored weapon GLTF grip, and both facing directions.
  await evaluate('window.__fightersQA.setupSwordDuel()');
  const equipped=await evaluate('window.__fightersQA.snapshot()');
  if(!equipped.enemyWeapons[0]||equipped.enemyMotions[0]!=='Sword_Attack'||equipped.enemySwordGrips[0]>.16)
    fail('Weapon rig attachment or native Sword_Attack failed '+JSON.stringify(equipped));
  await evaluate('window.__fightersQA.poseAtAttack(.95)');
  const slashed=await evaluate('window.__fightersQA.snapshot()');
  if(slashed.health>=100)fail('Actual sword swing did not damage Nova '+JSON.stringify(slashed));
  await snap('night-street-native-enemy-sword');
  console.log('SWORD PASS: gripped imported mesh, native Sword_Attack, real hit and health loss');
  await evaluate('window.__fightersQA.reset()');

  await snap('night-street-costumed-start');
  const layout=await evaluate("(()=>{const el=document.getElementById('viewport'),r=el.getBoundingClientRect(),b=getComputedStyle(document.body);return {w:r.width,h:r.height,iw:innerWidth,ih:innerHeight,scrollX:scrollX,scrollY:scrollY,overflow:b.overflow,userSelect:b.userSelect,meta:document.querySelector('meta[name=viewport]').content,header:!!document.querySelector('.top'),panels:!!document.querySelector('.under')};})()");
  if(layout.w<layout.iw-1||layout.h<layout.ih-1||layout.scrollY!==0||layout.overflow!=='hidden'||layout.userSelect!=='none'||layout.header||layout.panels||!layout.meta.includes('user-scalable=no'))fail('Fullscreen/scroll/select/zoom lock failed '+JSON.stringify(layout));
  if(initial.heroSpeed<5||Math.abs(initial.heroClipScale-1.45)>.05||initial.enemyClipScales.some(v=>Math.abs(v-1)>.05))
    fail('Only heroine should be sped up '+JSON.stringify(initial));
  // Isolate input response from combat stuns, then re-enable real AI for fight QA.
  await evaluate('window.__fightersQA.setEnemiesPassive(true)');
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const area=await evaluate("(()=>{const x=document.getElementById('viewport').getBoundingClientRect();return {x:x.left,y:x.top,w:x.width,h:x.height};})()");
  const ry=area.y+area.h*.6;
  const rightX=area.x+area.w*.8;
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:11,x:rightX,y:ry}]});
  await waitUntil("window.__fightersQA.snapshot().heroGuard===true",'right long-press guard',6000);
  const guard=await evaluate("window.__fightersQA.snapshot().heroGuard");
  if(!guard)fail('Right long-press did not engage block');
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await delay(130);
  const released=await evaluate("window.__fightersQA.snapshot().heroGuard");
  if(released)fail('Guard did not disengage when right finger lifted');
  // South held is also a deliberate directional block; a short flick dodges.
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:19,x:rightX,y:ry}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:19,x:rightX,y:ry+75}]});
  await delay(400);
  const south=await evaluate("window.__fightersQA.snapshot()");
  if(!south.heroGuard||south.lastRightAction!=='guard')fail('South-hold guard failed '+JSON.stringify(south));
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await delay(130);
  if(await evaluate("window.__fightersQA.snapshot().heroGuard"))fail('South-hold guard stuck after release');
  const leftX=area.x+area.w*.17;
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:12,x:leftX,y:ry}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:12,x:leftX+85,y:ry}]});
  await delay(220);
  const touchDirection=await evaluate("window.__fightersQA.snapshot().touchX");
  if(touchDirection<.6)fail('Left gesture not recognized');
  const leftBefore=await evaluate("window.__fightersQA.snapshot().heroX");
  await delay(570);
  const leftAfter=await evaluate("window.__fightersQA.snapshot().heroX");
  if(leftAfter<=leftBefore+.65){await snap('gesture-hold-diagnostic');fail('Holding left finger did not sustain movement');}
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await delay(150);
  if((await evaluate("window.__fightersQA.snapshot().touchX"))!==0)fail('Left finger release did not stop movement');
  console.log('Gesture QA PASS: left hold-to-move, right long-press and south-hold blocks');
  const beforeX=await evaluate("window.__fightersQA.snapshot().heroX");
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await delay(500);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  const afterX=await evaluate("window.__fightersQA.snapshot().heroX");
  if(afterX<=beforeX+.35)fail('Hero did not move right under keyboard input');
  await snap('night-street-start');
  async function swipe(id,dx,dy,direction,expected,waitMs=160){
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id,x:rightX,y:ry}]});
    await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id,x:rightX+dx,y:ry+dy}]});
    if(waitMs)await delay(waitMs);
    const result=await evaluate("window.__fightersQA.snapshot()");
    if(result.lastRightGesture!==direction||result.lastRightAction!==expected)
      fail(direction+' gesture mapped incorrectly '+JSON.stringify(result));
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    return result;
  }
  // Kick is on-rig procedural leg animation, so inspect its actual pose, too.
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:20,x:rightX,y:ry}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:20,x:rightX+57,y:ry+57}]});
  const kickStart=await evaluate("window.__fightersQA.snapshot()");
  if(kickStart.lastRightGesture!=='SE'||kickStart.lastRightAction!=='kickRight')
    fail('SE kick gesture did not dispatch '+JSON.stringify(kickStart));
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  // Pose this same in-game kick on exact physics ticks, independent of GPU frame stalls.
  await evaluate('window.__fightersQA.reset()');
  await evaluate("window.__fightersQA.startKickPose('kickRight')");
  const kickTiming=await evaluate("window.__fightersQA.snapshot()");
  if(kickTiming.heroAttack!=='kickRight'||kickTiming.heroKickDuration>=.63)
    fail('Ground kick must recover significantly faster '+JSON.stringify(kickTiming));
  await evaluate('window.__fightersQA.poseAtAttack(.18)');
  const kick=await evaluate("window.__fightersQA.snapshot()");
  if(kick.heroAttack!=='kickRight'||kick.heroKickExtension<.9||Math.abs(kick.heroKickPivot)<.13)
    fail('Fast ground kick must extend leg and pivot the heroine '+JSON.stringify(kick));
  await snap('night-street-native-kick-frozen-impact');
  await evaluate('window.__fightersQA.poseAtAttack(.5)');
  const retracted=await evaluate("window.__fightersQA.snapshot()");
  if(retracted.heroAttack||Math.abs(retracted.heroKickPivot)>.01||retracted.heroKickExtension>.01)
    fail('Kick must retract and untwist fully '+JSON.stringify(retracted));
  console.log('SNAPPY KICK PASS: fast impact, body pivot, full untwist/recovery');
  await evaluate('window.__fightersQA.freeze(false)');
  const jx=rightX,jy=ry;
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:21,x:jx,y:jy}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:21,x:jx,y:jy-24}]});
  const jumping=await evaluate("window.__fightersQA.snapshot()");
  if(jumping.lastRightAction!=='jump'||jumping.heroJumpY<=0)fail('North swipe did not jump immediately '+JSON.stringify(jumping));
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  // Dispatch consecutive CDP touch commands in one browser input burst.
  // SwiftShader frames are slow: sequential remote round trips can exceed the full leap.
  await evaluate('window.__fightersQA.reset()');
  await evaluate('window.__fightersQA.setEnemiesPassive(true)');
  await Promise.all([
    call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:41,x:jx,y:jy}]}),
    call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:41,x:jx,y:jy-24}]}),
    call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}),
    call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:42,x:jx,y:jy}]}),
    call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:42,x:jx-59,y:jy-59}]})
  ]);
  const airJab=await evaluate("window.__fightersQA.snapshot()");
  if(!airJab.heroAirAttack||!airJab.heroAirLayer||airJab.heroAttack!=='jab')
    fail('Jump + punch must blend a real upper-body punch over the leap '+JSON.stringify(airJab));
  await evaluate('window.__fightersQA.poseAtAttack(.18)');
  const posedPunch=await evaluate("window.__fightersQA.snapshot()");
  if(!posedPunch.heroAirAttack||posedPunch.heroAirLayerTime<.08||posedPunch.heroJumpY<.2)
    fail('Actual upper-body punch clip not advancing over the jump '+JSON.stringify(posedPunch));
  await snap('night-street-air-punch-frozen');
  await evaluate('window.__fightersQA.freeze(false)');
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitUntil("!window.__fightersQA.snapshot().heroAttack",'air punch recovery',10000);
  await evaluate('window.__fightersQA.reset()');
  await evaluate('window.__fightersQA.setEnemiesPassive(true)');
  await Promise.all([
    call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:43,x:jx,y:jy}]}),
    call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:43,x:jx,y:jy-24}]}),
    call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}),
    call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:44,x:jx,y:jy}]}),
    call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:44,x:jx+58,y:jy+58}]})
  ]);
  const airKickStart=await evaluate("window.__fightersQA.snapshot()");
  if(!airKickStart.heroAirAttack||airKickStart.heroAttack!=='kickRight')
    fail('Jump + air kick not triggered '+JSON.stringify(airKickStart));
  await evaluate('window.__fightersQA.poseAtAttack(.28)');
  const airKick=await evaluate("window.__fightersQA.snapshot()");
  if(!airKick.heroAirAttack||airKick.heroKickExtension<.5||
     Math.abs(airKick.heroKickPivot)<.07||airKick.heroJumpY<.2)
    fail('Actual airborne leg kick did not extend and pivot '+JSON.stringify(airKick));
  await snap('night-street-air-kick-frozen');
  await evaluate('window.__fightersQA.freeze(false)');
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitUntil("!window.__fightersQA.snapshot().heroAttack",'air kick recovery',10000);
  console.log('AIR COMBAT PASS: short up flick, additive upper-body punch over jumping legs, procedural airborne kick');
  for(const [direction,dx,dy,action,id] of [
    ['NE',59,-59,'cross',23],
    ['W',-72,0,'bodyLeft',24],
    ['E',72,0,'bodyRight',25],
    ['SW',-59,59,'kickLeft',26]
  ])await swipe(id,dx,dy,direction,action);
  console.log('8-DIRECTION QA PASS: jump, high punches, body punches, both kicks, guard and tap-combo route');
  await evaluate('window.__fightersQA.reset()');
  // Deterministic contact: one real enemy at jab reach, other two away.
  // Exercises the unmodified attack timer + hit detection without random AI stuns.
  await evaluate('window.__fightersQA.arrangeDuel()');
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});
  await evaluate('window.__fightersQA.poseAtAttack(.5)');
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});
  const afterCombat=await evaluate("window.__fightersQA.snapshot()");
  await snap('night-street-combat-contact');
  if(afterCombat.score<=0||afterCombat.enemyHealth[0]>=35)
    fail('Real jab animation did not contact the enemy '+JSON.stringify(afterCombat));
  console.log('Beat em up PASS: movement, three dressed enemies, timed impact, score '+afterCombat.score);
  // A real transition through enemy cleanup -> 1.5s round delay -> spawnWave().
  await evaluate('window.__fightersQA.reset()');
  await evaluate('window.__fightersQA.injureAndClearRound()');
  const injured=await evaluate("({state:window.__fightersQA.snapshot(),bar:document.getElementById('life').style.width})");
  if(injured.state.health!==27||injured.bar!=='27%')
    fail('Round-clear setup did not show reduced health '+JSON.stringify(injured));
  await evaluate('window.__fightersQA.poseAtAttack(1.0)');
  await evaluate('window.__fightersQA.poseAtAttack(1.0)');
  const healed=await evaluate("({state:window.__fightersQA.snapshot(),bar:document.getElementById('life').style.width})");
  if(healed.state.wave!==2||healed.state.health!==100||healed.bar!=='100%'||healed.state.enemies!==4)
    fail('Next round did not fully replenish health and HUD '+JSON.stringify(healed));
  console.log('ROUND HEAL PASS: health 27 -> 100, HUD 27% -> 100%, wave 1 -> 2');
  for(const kind of ['jab','cross'])for(const facing of [1,-1]){
    await evaluate("window.__fightersQA.setupAirPunch("+facing+",'"+kind+"')");
    await evaluate('window.__fightersQA.poseAtAttack(.18)');
    const arms=await evaluate('window.__fightersQA.armPose()');
    const hand=kind==='jab'?'right':'left';
    const reach=arms.armX[hand]*facing;
    if(reach<.16)fail('Air '+kind+' fist went behind Nova facing '+facing+' '+JSON.stringify(arms));
    if((kind==='jab'&&facing<0)||(kind==='cross'&&facing>0))
      await snap('night-street-air-'+kind+'-facing-'+(facing>0?'right':'left'));
  }
  // Turning the movement thumb while airborne immediately redirects the punch.
  await evaluate("window.__fightersQA.setupAirPunch(1,'jab')");
  await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
  await evaluate('window.__fightersQA.poseAtAttack(.18)');
  const steered=await evaluate('window.__fightersQA.armPose()');
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
  if(steered.facing!==-1||steered.armX.right>=-.16)
    fail('Aerial punch failed to turn toward left-thumb input '+JSON.stringify(steered));
  console.log('AIR FACING PASS: jab/cross forward on both sides, left-thumb midair steering');
  await evaluate('window.__fightersQA.freeze(false)');
  await evaluate('window.__fightersQA.setEnemiesPassive(false)');
  for(const [w,h,label] of [[844,390,'landscape'],[390,844,'portrait']]){
    await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true});
    await delay(350);
    const rect=await evaluate("(()=>{const r=document.querySelector('#viewport').getBoundingClientRect();return {w:r.width,h:r.height,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,iw:innerWidth,ih:innerHeight};})()");
    if(Math.abs(rect.w-rect.iw)>1||Math.abs(rect.h-rect.ih)>1||rect.sw>rect.iw+1||rect.sh>rect.ih+1)
      fail('Mobile fullscreen overflow '+label+' '+JSON.stringify(rect));
    await snap('night-street-mobile-'+label);
  }
  console.log('Mobile landscape + portrait viewport PASS');
  console.log('Fighters real WebGL QA PASS');
} finally {
  if(socket)socket.close();
  chrome.kill('SIGTERM');
  await delay(300);
  rmSync(profile,{recursive:true,force:true});
}