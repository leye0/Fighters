#!/usr/bin/env node
/** Browser acceptance tests for the RTS prototype, in real Chrome WebGL. */
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=process.env.FIGHTERS_URL||'http://127.0.0.1:8000/';
const profile=mkdtempSync(join(tmpdir(),'fighters-rts-'));
mkdirSync('captures',{recursive:true});
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-gl=angle',
 '--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl',
 '--window-size=1365,900','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
let socket,nextId=0;const pending=new Map();
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function check(value,message){if(!value)throw Error(message);}
async function connect(){
 const path=join(profile,'DevToolsActivePort');
 for(let i=0;i<120&&!existsSync(path);i++)await sleep(250);
 check(existsSync(path),'Chrome debugger did not start');
 const port=readFileSync(path,'utf8').split('\n')[0];
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const page=tabs.find(t=>t.type==='page');check(page,'No Chrome tab');
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=ev=>{
  const msg=JSON.parse(ev.data),job=pending.get(msg.id);
  if(!job)return;pending.delete(msg.id);
  msg.error?job.reject(Error(JSON.stringify(msg.error))):job.resolve(msg.result);
 };
}
function call(method,params={}){
 const id=++nextId;
 return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
}
async function evaluate(expression){
 const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result.exceptionDetails)throw Error('Browser error: '+JSON.stringify(result.exceptionDetails));
 return result.result.value;
}
async function until(expression,label,timeout=90000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  if(await evaluate(expression))return;
  await sleep(500);
 }
 throw Error('Timeout waiting for '+label+': '+JSON.stringify(await evaluate("({title:document.querySelector('#overlay-title')?.textContent,desc:document.querySelector('#overlay-desc')?.textContent,qa:window.__fightersQA?.snapshot()})")));
}
async function screenshot(name){
 await sleep(300);
 const png=await call('Page.captureScreenshot',{format:'png'});
 writeFileSync('captures/'+name+'.png',Buffer.from(png.data,'base64'));
}
async function run(){
 await connect();await call('Page.enable');await call('Runtime.enable');
 const errors=[];
 socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.method==='Runtime.exceptionThrown')
    errors.push(msg.params.exceptionDetails?.text||'Unknown JavaScript exception');
 });
 await call('Page.navigate',{url:root+'?qa=1'});
 await until('window.__fightersQA?.snapshot().running===true','RTS startup');
 await until('window.__fightersQA.snapshot().witchHouseLoaded','real witch house hitbox');
 let s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4,'Starting troops');
 check(s.loading.compressed,'Native characters should load from optimized gzip assets');
 for(const [name,profile] of Object.entries(s.loading.characters)){
  check(profile.transport==='gzip'&&profile.wireBytes>0&&
    profile.wireBytes<profile.decodedBytes*.8,
   'Lossless compressed rig not used: '+name+' '+JSON.stringify(profile));
 }
 check(s.loading.readyMs>0&&s.loading.downloadMs>0,'Missing startup measurements');
 console.log('LOAD PROFILE (real Chrome):',JSON.stringify(s.loading));

 check(s.house.hitbox.maxX>s.house.hitbox.minX&&s.house.hitbox.maxZ>s.house.hitbox.minZ,
  'House requires actual 3D bounding volume');
 check(s.gold.witch===2000&&s.gold.orc===900,'Starting resources');
 check(s.selectedBuilding==='witch-house','Starting house selection');
 check(s.projection==='orthographic','Expected RTS orthographic camera');
 check(await evaluate("document.querySelector('#command-title').textContent.includes('Maison des sorcières')"),
  'Building info panel missing');
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Sorcière'))"),
  'Training action missing from contextual panel');
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Améliorer'))"),
  'Upgrade action missing from contextual panel');
 check(await evaluate("document.querySelector('#command-icon').textContent.length>0"),
  'Contextual building portrait missing');
 // Shortcuts must keep their DOM identity throughout a long simulated match.
 check(await evaluate("['quick-home','quick-army','quick-attack','quick-stop','quick-cancel'].every(id=>!!document.getElementById(id))"),
  'Permanent quick-command bar not found');
 await evaluate("window.__stableQuick=document.querySelector('#quick-home');window.__stableTrain=document.querySelector('#command-buttons button')");
 const steady=await evaluate('window.__fightersQA.snapshot()');
 await evaluate('window.__fightersQA.advance(70)');
 const postSteady=await evaluate('window.__fightersQA.snapshot()');
 check(postSteady.ui.commandRebuilds-steady.ui.commandRebuilds<=1,
   'HUD rebuilt during idle match: '+JSON.stringify([steady.ui,postSteady.ui]));
 check(await evaluate("window.__stableQuick===document.querySelector('#quick-home')&&window.__stableTrain===document.querySelector('#command-buttons button')"),
   'Quick/context button DOM identity was not preserved');


 check(await evaluate("document.querySelector('#witch-faction,#orc-faction,#zoom-in,#zoom-out')===null"),
  'Unused faction/zoom toolbar remains on screen');
 await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Equal',bubbles:true}))");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.cameraZoom<35,'Keyboard zoom must change camera projection');
 await evaluate("document.querySelector('#viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:220,clientX:680,clientY:340,bubbles:true,cancelable:true}))");
 check((await evaluate('window.__fightersQA.snapshot()')).cameraZoom>s.cameraZoom,
  'Mouse wheel must zoom out');
 await evaluate('window.__fightersQA.reset()');

 check(await evaluate('window.__fightersQA.train()'),'Witch training refused');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.gold.witch===1880&&s.trainingCount===1,'Witch production queue must charge gold');
 check(await evaluate("document.querySelector('.production-jobs button')!==null"),
  'Cancellable Warcraft-style production queue missing');
 await evaluate('window.__fightersQA.advance(3.6)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===4&&s.trainingCount===0,'Trained witch must leave queue');
 check(await evaluate('window.__fightersQA.upgradeHouse()'),'House upgrade refused');
 await evaluate('window.__fightersQA.advance(8.1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.house.level===2&&s.house.maxHealth===750,'House upgrade level/HP failed');
 check(await evaluate('window.__fightersQA.train()'),'Upgraded house cannot train');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.house.queue[0].duration<3.5,'House upgrade should improve training time');
 await evaluate('window.__fightersQA.advance(3)');
 check((await evaluate('window.__fightersQA.snapshot()')).witches.length===5,
  'Upgraded house production failed');
 await evaluate('window.__fightersQA.selectWitches();window.__fightersQA.move(-3,-3)');
 check(await evaluate("document.querySelector('.order-ping.move')!==null"),
   'Move order needs a blue fading marker');
 await until("window.__fightersQA.snapshot().ui.activePings===0",'blue order reticle cleanup',10000);
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.selectedIds.length===5,'RTS group selection failed');
 const before=s.witches[0];
 await evaluate('window.__fightersQA.advance(1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(s.witches[0].x-before.x,s.witches[0].z-before.z)>1,
  'Group move order not followed');

 await until('window.__fightersQA.snapshot().blueprints.length===5',
  'Five real orc building blueprints',100000);
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===5,'Five default orc buildings');
 check(s.buildings.every(b=>b.hitbox.maxX>b.hitbox.minX&&b.hitbox.maxZ>b.hitbox.minZ),
  'Every orc structure must have a real 3D collider');
 check(s.buildings.every(b=>b.healthbarParent==='scene'),
   'Orc HP bars must not inherit a building rotation/scale');
 check(s.buildings.every(b=>b.healthbarPosition[1]>b.hitbox.maxY),
   'Orc HP bars must be above building top');

 await evaluate("window.__fightersQA.setFaction('orc');window.__fightersQA.selectOrcBarrack()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.selectedBuilding==='barrack','Orc barrack contextual selection');
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Entraîner orc'))"),
  'Orc barrack training action missing');
 check(await evaluate("window.__fightersQA.trainOrc()"),'Orc production refused');
 await evaluate('window.__fightersQA.advance(4.6)');
 check((await evaluate('window.__fightersQA.snapshot()')).orcs.length===5,
  'Orc barrack training queue failed');

 check(await evaluate("window.__fightersQA.beginBuild('hut')"),'Hut placement action refused');
 check(await evaluate("!!window.__fightersQA.build('hut',8,-10)"),'Orc hut construction failed');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===6&&s.buildings.filter(b=>b.type==='hut').length===2,
  'Second hut must be a unique placed building');
 check(!await evaluate("!!window.__fightersQA.build('hut',8,-10)"),
  'Colliding building placement must be refused');
 check(!await evaluate('window.__fightersQA.isClear(8,-10)'),
  'Real solid building collider must block its centre');
 const newHut=s.buildings.find(b=>!b.initial);
 check(newHut?.hitbox.minX<8&&newHut.hitbox.maxX>8,'Constructed hut hitbox does not cover mesh');
 const house=s.house.hitbox;
 check(!await evaluate('window.__fightersQA.isClear('+((house.minX+house.maxX)/2)+','+
  ((house.minZ+house.maxZ)/2)+')'),'Witch house collider is not solid');

 // Original WarConquer-inspired A* must route around our ACTUAL placed hut.
 const planned=await evaluate('window.__fightersQA.route({x:4,z:-10},{x:13,z:-10})');
 check(planned?.waypoints?.length>=2,'Pathfinding did not detour around the hut');
 await evaluate("window.__fightersQA.moveUnitTo('orc',0,4,-10);window.__fightersQA.selectUnit('orc',0);window.__fightersQA.move(13,-10)");
 const travel=await evaluate("window.__fightersQA.auditTravel('orc',0,10)");
 check(travel.blocked===0,'A moving orc crossed a building collider: '+JSON.stringify(travel));
 check(travel.end.x>11,'Orc did not navigate around hut to destination: '+JSON.stringify(travel));

 // Click the raised 3D hitbox, not just a world-ground distance circle.
 const clicked=await evaluate("(function(){const s=window.__fightersQA.snapshot();const b=s.buildings.find(b=>!b.initial);const p=window.__fightersQA.buildingScreenPoint(b.id);window.__fightersQA.tap(p.x,p.y);return window.__fightersQA.snapshot().selectedBuildingId===b.id})()");
 check(clicked,'Building roof/hitbox picking failed');
 await screenshot('rts-orc-building-panel');

 await evaluate("window.__fightersQA.selectOrcBarrack()");
 check(await evaluate('window.__fightersQA.upgradeSelected()'),'Orc barrack upgrade refused');
 await evaluate('window.__fightersQA.advance(8.1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const barrack=s.buildings.find(b=>b.type==='barrack');
 check(barrack.level===2,'Barrack upgrade must advance building level');
 await until("window.__fightersQA.snapshot().buildings.find(b=>b.type==='barrack').visualLevel===2",
  'Genuine level-two orc GLB',50000);
 await screenshot('rts-orc-upgraded-barrack');

 await evaluate("window.__fightersQA.setFaction('witch');window.__fightersQA.selectHouse()");
 await screenshot('rts-witch-house-panel');

 // Responsive command grid must remain visible in portrait phone layout.
 await call('Emulation.setDeviceMetricsOverride',{
  width:390,height:844,deviceScaleFactor:1,mobile:true
 });
 await sleep(450);
 const mobile=await evaluate("(()=>{const p=document.querySelector('#command-panel').getBoundingClientRect();const q=document.querySelector('#pause').getBoundingClientRect();return {width:innerWidth,height:innerHeight,panel:p.toJSON(),pause:q.toJSON(),scrollWidth:document.documentElement.scrollWidth}})()");
 check(mobile.panel.width<=mobile.width&&mobile.panel.bottom<=mobile.height+1,
  'Mobile command panel exceeds viewport');
 check(mobile.pause.width>0,'Compact pause button missing');
 await screenshot('rts-mobile-command-panel');
 const framing=await evaluate("(()=>{const hero=document.querySelector('.hero-hud').getBoundingClientRect();const score=document.querySelector('.score').getBoundingClientRect();const pause=document.querySelector('#pause').getBoundingClientRect();return {hero:{right:hero.right,bottom:hero.bottom},score:{left:score.left,right:score.right},pause:{left:pause.left,right:pause.right}}})()");
 check(framing.hero.right<=framing.score.left+3&&framing.score.right<=framing.pause.left+4&&
  framing.pause.right<=mobile.width+1,'Compact mobile HUD overlaps: '+JSON.stringify(framing));
 // Real multi-touch input through Chrome DevTools, not a programmatic zoom setter.
 await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const touch=(id,x,y)=>({id,x,y,force:1,radiusX:4,radiusY:4});
 const beforePinch=await evaluate('window.__fightersQA.snapshot()');
 await call('Input.dispatchTouchEvent',{type:'touchStart',
  touchPoints:[touch(1,135,290),touch(2,255,290)]});
 await call('Input.dispatchTouchEvent',{type:'touchMove',
  touchPoints:[touch(1,110,290),touch(2,280,290)]});
 await sleep(100);
 const afterPinch=await evaluate('window.__fightersQA.snapshot()');
 check(afterPinch.cameraZoom<beforePinch.cameraZoom-1,
  'Two-finger zoom did not change orthographic camera: '+JSON.stringify({
    before:beforePinch.cameraZoom,after:afterPinch.cameraZoom}));
 // Two-finger parallel translation should NOT pan: reserved for zoom.
 await call('Input.dispatchTouchEvent',{type:'touchMove',
  touchPoints:[touch(1,160,350),touch(2,330,350)]});
 await sleep(100);
 const parallel=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(parallel.cameraCenter.x-afterPinch.cameraCenter.x,
   parallel.cameraCenter.z-afterPinch.cameraCenter.z)<.08,
   'Two-finger drag must not pan the camera');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

 const beforeSinglePan=await evaluate('window.__fightersQA.snapshot()');
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(4,155,310)]});
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(4,220,355)]});
 await sleep(80);
 const afterSinglePan=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(afterSinglePan.cameraCenter.x-beforeSinglePan.cameraCenter.x,
   afterSinglePan.cameraCenter.z-beforeSinglePan.cameraCenter.z)>.2,
   'One-finger drag must pan the camera');
 check(afterSinglePan.selectedIds.join(',')===beforeSinglePan.selectedIds.join(','),
   'One-finger drag inadvertently selected units');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

 // Hold one full second before dragging to activate selection, without panning.
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(5,200,260)]});
 await sleep(1120);
 check((await evaluate('window.__fightersQA.snapshot()')).touchGesture==='select',
   'One-second long press did not enable box selection');
 const beforeHoldDrag=await evaluate('window.__fightersQA.snapshot()');
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(5,280,355)]});
 check(await evaluate("document.querySelector('#selection-rectangle').hidden===false"),
   'Long-press drag must reveal selection rectangle');
 const afterHoldDrag=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(afterHoldDrag.cameraCenter.x-beforeHoldDrag.cameraCenter.x,
   afterHoldDrag.cameraCenter.z-beforeHoldDrag.cameraCenter.z)<.05,
   'Long-press box selection must not pan camera');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 check(await evaluate("document.querySelector('#selection-rectangle').hidden"),
   'Selection rectangle not cleared on finger release');
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 await screenshot('rts-mobile-pinch-zoom');
 await call('Emulation.clearDeviceMetricsOverride');

 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4,'Reset starting troops');
 // A mine without a working orc must not grant passive gold, regardless of
 // whether the mine GLB is already visible and animated.
 const noWorkerGold=s.gold.orc;
 await evaluate('window.__fightersQA.advance(13)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.gold.orc===noWorkerGold&&s.mining.totalMinedGold===0&&
   s.mining.workers.length===0,'Mine generated gold without any worker');
 check(s.house.level===1&&s.buildings.length===5,'Reset starting buildings');
 check(await evaluate('window.__fightersQA.isClear(8,-10)'),
  'Reset must remove constructed building hitboxes');

 // First tap selects a witch, second tap directly attacks the enemy building.
 const hutId=(await evaluate('window.__fightersQA.snapshot()')).buildings.find(b=>b.type==='hut').id;
 await evaluate("window.__fightersQA.reset();window.__fightersQA.centerCamera(-18,-14)");
 const witchPoint=await evaluate("window.__fightersQA.unitScreenPoint('witch',0)");
 check(witchPoint&&Number.isFinite(witchPoint.x),'Cannot project witch');
 await evaluate("window.__fightersQA.tap("+witchPoint.x+","+witchPoint.y+")");
 let tapState=await evaluate('window.__fightersQA.snapshot()');
 check(tapState.selectedIds.length===1,'First tap did not select a witch');
 await evaluate("window.__fightersQA.centerCamera(22,21)");
 const targetPoint=await evaluate("window.__fightersQA.buildingScreenPoint("+JSON.stringify(hutId)+")");
 check(targetPoint&&Number.isFinite(targetPoint.x),'Cannot project hut');
 await evaluate("window.__fightersQA.tap("+targetPoint.x+","+targetPoint.y+")");
 tapState=await evaluate('window.__fightersQA.snapshot()');
 check(tapState.witches.find(u=>u.id===tapState.selectedIds[0])?.attackTargetId===hutId,
   'Second tap did not order witch to destroy enemy building');
 check(await evaluate("document.querySelector('.order-ping.attack')!==null"),
   'Attack order needs a red fading reticle');
 await until("window.__fightersQA.snapshot().ui.activePings===0",'red order reticle cleanup',10000);
 await evaluate('window.__fightersQA.reset()');

 // Real native animation, target acquisition, damage and destruction.
 await evaluate("window.__fightersQA.passive('orc');window.__fightersQA.selectUnit('witch',0)");

 await evaluate("window.__fightersQA.moveUnitTo('witch',0,18.5,21)");
 check(await evaluate("window.__fightersQA.attackBuilding("+JSON.stringify(hutId)+")"),
  'Attack-building order was rejected');
 await evaluate('window.__fightersQA.advance(17)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const destroyed=s.buildings.find(b=>b.id===hutId);
 check(destroyed?.destroyed&&destroyed.health===0,
  'Witch attacks did not destroy the orc hut: '+JSON.stringify(destroyed));
 check(await evaluate('window.__fightersQA.isClear(22,21)'),
  'Destroyed building must be removed from the navigation grid');
 await screenshot('rts-destroyed-orc-hut');

 // Attack from different reachable directions; the issued order alone is
 // NOT success. Assert the target actually loses HP and enters the melee range.
 const sides=[
  {x:12,z:24},{x:20,z:26},{x:26,z:24},{x:25,z:16},
  {x:10,z:19},{x:26,z:19},{x:20,z:12},{x:14,z:26},
  {x:-12,z:-13}
 ];
 let attempted=0;
 for(const from of sides){
  await evaluate("window.__fightersQA.reset();window.__fightersQA.passive('orc')");
  const state=await evaluate('window.__fightersQA.snapshot()');
  const target=state.buildings.find(b=>b.type==='hut'&&!b.destroyed);
  if(!await evaluate("window.__fightersQA.isClear("+from.x+","+from.z+")"))continue;
  await evaluate("window.__fightersQA.moveUnitTo('witch',0,"+from.x+","+from.z+");window.__fightersQA.selectUnit('witch',0)");
  check(await evaluate("window.__fightersQA.attackBuilding("+JSON.stringify(target.id)+")"),
    'Attack order failed for '+JSON.stringify(from));
  await evaluate("window.__fightersQA.advance("+((from.x<0)?37:17)+")");
  const after=await evaluate('window.__fightersQA.snapshot()');
  const updated=after.buildings.find(b=>b.id===target.id);
  check(updated.health<target.health,
    'Witch remained idle outside enemy building attack range from '+JSON.stringify(from)+
    ' before='+target.health+' after='+updated.health+
    ' witch='+JSON.stringify(after.witches[0]));
  attempted++;
 }
 check(attempted>=6,'Expected at least 6 distinct valid attack-angle trials, got '+attempted);
 console.log('PASS multi-angle building attacks:',attempted);

 // The orc faction must also damage/destroy the main witch house.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.passive('witch');window.__fightersQA.setFaction('orc')");
 await evaluate("window.__fightersQA.moveUnitTo('orc',0,-18.2,-17.5);window.__fightersQA.selectUnit('orc',0);window.__fightersQA.setBuildingHealth('witch-house-01',27)");
 check(await evaluate("window.__fightersQA.attackBuilding('witch-house-01')"),
   'Orc attack-building order was rejected');
 await evaluate('window.__fightersQA.advance(16)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.house.destroyed&&s.house.health===0&&!s.running,
  'Orc must destroy witch house and end the match: '+JSON.stringify(s.house));
 check(await evaluate("document.querySelector('#overlay-title').textContent==='DÉFAITE'"),
  'Destruction of player HQ must announce defeat');

 // Enable real orc director, accelerate physics, inspect real built models.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.enableOrcAI(true)");
 await evaluate("window.__aiButtonBefore=document.querySelector('#command-buttons button')");
 const rebuildsBeforeAI=(await evaluate('window.__fightersQA.snapshot()')).ui.commandRebuilds;
 await evaluate('window.__fightersQA.advance(41)');
 const rebuildsAfterAI=(await evaluate('window.__fightersQA.snapshot()')).ui.commandRebuilds;
 check(rebuildsAfterAI-rebuildsBeforeAI<=2&&
   await evaluate("document.querySelector('#command-buttons button')===window.__aiButtonBefore"),
   'Orc mine income triggered repeated HUD/button rebuilding');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.mining.completedMiningCycles>=1&&s.mining.totalMinedGold>0,
   'Orc gold never came from a physical mining work cycle: '+JSON.stringify(s.mining));
 check(s.mining.workers.length>0,'AI must send actual workers to orc mines');
 check(s.orcAI.decisions.some(a=>a.type==='build'),
  'Orc director never planned a village expansion: '+JSON.stringify(s.orcAI));
 check(s.orcAI.decisions.some(a=>a.type==='train'),
  'Orc director never recruited troops');
 check(s.buildings.filter(b=>!b.destroyed).length>=6,
  'Orc village did not grow: '+JSON.stringify(s.buildings.map(b=>b.type)));
 check(s.buildings.filter(b=>!b.destroyed).every(b=>b.healthbarParent==='scene'),
  'Autonomously built HP bars inherited building transforms');
 await screenshot('rts-orc-autonomous-village');

 // Unit disks must separate even if a legacy spawn leaves identical positions.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.passive('orc')");
 await evaluate("window.__fightersQA.moveUnitTo('witch',0,-8,-8);window.__fightersQA.moveUnitTo('witch',1,-8,-8);window.__fightersQA.advance(.25)");
 s=await evaluate('window.__fightersQA.snapshot()');
 const a=s.witches[0],b=s.witches[1];
 check(Math.hypot(a.x-b.x,a.z-b.z)>=.89,
   'Two idle witches remained superimposed: '+JSON.stringify([a,b]));
 await evaluate('window.__fightersQA.selectWitches();window.__fightersQA.move(-5,-4);window.__fightersQA.advance(8)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const living=s.witches;
 for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++)
  check(Math.hypot(living[i].x-living[j].x,living[i].z-living[j].z)>=.87,
    'Moving witches overlapped physical footprint');

 await evaluate('window.__fightersQA.enableOrcAI(false);window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4&&
  s.buildings.filter(b=>!b.destroyed).length===5,'Reset after AI restores starting match');
 check(!errors.length,'Browser JavaScript exceptions: '+errors.join(' | '));
 console.log('PASS RTS: stable HUD, persistent shortcuts, blue/red reticles, two-tap attacks, one-finger pan, long-press selection, two-finger zoom, destroyed buildings and strategic AI.');

}
try{await run();}finally{try{socket?.close();}catch{}chrome.kill();try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:350});}catch(error){console.warn('Chrome profile cleanup only:',error.message);}}
