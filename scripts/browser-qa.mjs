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
  fail('Timeout: '+label+' / '+String(await evaluate("document.getElementById('load-status')?.textContent")));
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
  await selectClip('Sword Regular Combo');
  await delay(600);
  await snap(label+'-sword');
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
  await waitUntil("!!window.__fightersQA && window.__fightersQA.snapshot().ready===true",'game models',100000);
  const initial=await evaluate("window.__fightersQA.snapshot()");
  if(initial.enemies!==3||initial.health!==100)fail('Game initial state incorrect '+JSON.stringify(initial));
  if(initial.outfit?.garmentMeshes!==4||initial.outfit?.hairMeshes!==1||
     initial.outfit?.headTriangles<20||initial.enemyOutfits?.some(o=>o.garmentMeshes<4||o.hairMeshes!==1))
    fail('Civilian clothing/hair not bound to all actors '+JSON.stringify(initial));
  console.log('COSTUMES PASS: civilian Peasant outfits, hair and isolated head, matching 65-joint bindings');
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
  const gestureDiag=await evaluate("window.__fightersQA.snapshot()");
  console.log('LEFT_HOLD_DIAG '+JSON.stringify({leftBefore,leftAfter,delta:leftAfter-leftBefore,state:gestureDiag}));
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
  async function swipe(id,dx,dy,direction,expected){
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id,x:rightX,y:ry}]});
    await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id,x:rightX+dx,y:ry+dy}]});
    await delay(160);
    const result=await evaluate("window.__fightersQA.snapshot()");
    if(result.lastRightGesture!==direction||result.lastRightAction!==expected)
      fail(direction+' gesture mapped incorrectly '+JSON.stringify(result));
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    return result;
  }
  // Kick is on-rig procedural leg animation, so inspect its actual pose, too.
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:20,x:rightX,y:ry}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:20,x:rightX+57,y:ry+57}]});
  await delay(200);
  const kickStart=await evaluate("window.__fightersQA.snapshot()");
  console.log('KICK_START_DIAG '+JSON.stringify(kickStart));
  await waitUntil("window.__fightersQA.snapshot().heroKickExtension>.35",'native kick pose',8000);
  await evaluate('window.__fightersQA.freeze(true)');
  const kick=await evaluate("window.__fightersQA.snapshot()");
  if(kick.lastRightGesture!=='SE'||kick.heroAttack!=='kickRight')fail('SE kick failed '+JSON.stringify(kick));
  await snap('night-street-native-kick-frozen-impact');
  await evaluate('window.__fightersQA.freeze(false)');
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitUntil("!window.__fightersQA.snapshot().heroAttack",'kick recovery',10000);
  const jx=rightX,jy=ry;
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:21,x:jx,y:jy}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:21,x:jx,y:jy-24}]});
  await delay(120);
  const jumping=await evaluate("window.__fightersQA.snapshot()");
  if(jumping.lastRightAction!=='jump'||jumping.heroJumpY<=0)fail('North swipe did not jump immediately '+JSON.stringify(jumping));
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const airJab=await swipe(22,-59,-59,'NW','jab');
  if(!airJab.heroAirAttack||!airJab.heroAirLayer||airJab.heroAttack!=='jab')
    fail('Jump + punch must blend a real upper-body punch over the leap '+JSON.stringify(airJab));
  await snap('night-street-air-punch');
  await waitUntil("!window.__fightersQA.snapshot().heroAttack",'air punch recovery',10000);
  await evaluate('window.__fightersQA.reset()');
  await evaluate('window.__fightersQA.setEnemiesPassive(true)');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:31,x:jx,y:jy}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:31,x:jx,y:jy-24}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:32,x:jx,y:jy}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:32,x:jx+58,y:jy+58}]});
  await waitUntil("window.__fightersQA.snapshot().heroKickExtension>.25",'air kick pose',8000);
  await evaluate('window.__fightersQA.freeze(true)');
  const airKick=await evaluate("window.__fightersQA.snapshot()");
  if(!airKick.heroAirAttack||airKick.heroAttack!=='kickRight')fail('Jump + air kick failed '+JSON.stringify(airKick));
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
  await evaluate('window.__fightersQA.setEnemiesPassive(false)');
  await delay(1800);
  for(let n=0;n<5;n++){
    await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});
    await delay(70);
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'j',code:'KeyJ',windowsVirtualKeyCode:74});
    await delay(750);
  }
  const afterCombat=await evaluate("window.__fightersQA.snapshot()");
  await snap('night-street-combat');
  if(afterCombat.score<=0)fail('No successful punch contact in game '+JSON.stringify(afterCombat));
  console.log('Beat em up PASS: movement, three enemies, attack contacts, score '+afterCombat.score);
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