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

 // Verify actual UI controls, not just an exposed JS zoom setter.
 await evaluate("document.querySelector('#zoom-in').click()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.cameraZoom<30,'Zoom-in button must change orthographic projection');
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
 const mobile=await evaluate("(()=>{const p=document.querySelector('#command-panel').getBoundingClientRect();const q=document.querySelector('#zoom-in').getBoundingClientRect();return {width:innerWidth,height:innerHeight,panel:p.toJSON(),zoom:q.toJSON(),scrollWidth:document.documentElement.scrollWidth}})()");
 check(mobile.panel.width<=mobile.width&&mobile.panel.bottom<=mobile.height+1,
  'Mobile command panel exceeds viewport');
 check(mobile.zoom.width>0,'Mobile zoom button missing');
 await screenshot('rts-mobile-command-panel');
 await call('Emulation.clearDeviceMetricsOverride');

 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4,'Reset initial army');
 check(s.house.level===1&&s.buildings.length===5,'Reset must remove constructed hut and restore levels');
 check(await evaluate('window.__fightersQA.isClear(8,-10)'),
  'Reset must remove constructed hut collider');
 check(!errors.length,'Browser JS errors: '+errors.join(' | '));
 console.log('PASS RTS: WebGL, zoom buttons/wheel, Warcraft command grid, both faction queues, real level-2 GLB, hitboxes, A* detours, collision-free travel, mobile UI, full reset.');
}
try{await run();}finally{try{socket?.close();}catch{}chrome.kill();try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:350});}catch(error){console.warn('Chrome profile cleanup only:',error.message);}}
