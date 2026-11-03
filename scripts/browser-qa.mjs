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
 check(s.witches.map(u=>u.role).join(',')==='melee,worker,ranged',
  'Witches must start with worker, melee and ranged roles');
 check(s.orcs.map(u=>u.role).join(',')==='melee,worker,ranged,melee',
  'Orcs must start with one worker and two distinct fighter types');
 check(s.assets.sourceRigs===2&&s.assets.roleModelsLoaded===0,
  'Six roles must use only the two Quaternius rigs');
 for(const clan of ['witch','orc']){
  const sharing=await evaluate('window.__fightersQA.auditRigSharing('+JSON.stringify(clan)+')');
  check(sharing.bodyGeometryShared&&sharing.outfitGeometryShared&&
    sharing.roles.length===3,'Role outfits must share body and garment geometry: '+
    JSON.stringify(sharing));
 }
 check(s.assets.sharedMaterials<120,
  'Too many cosmetic materials: '+s.assets.sharedMaterials);
 console.log('PASS SIX CHARACTER ROLES: shared bodies and costume geometry, separate worker/melee/ranged stats.');
 check(s.loading.compressed,'Native characters should load from optimized gzip assets');
 const fullTransfer={female:20994430,male:20683626};
 const fullDecoded={female:35752840,male:35190592};
 for(const [name,profile] of Object.entries(s.loading.characters)){
  const gender=name.includes('female')?'female':'male';
  check(name.includes('.rts.glb')&&profile.transport==='gzip'&&profile.wireBytes>0&&
    profile.wireBytes<fullTransfer[gender]*.85&&
    profile.decodedBytes<fullDecoded[gender]*.6,
   'Compact native rig not used: '+name+' '+JSON.stringify(profile));
 }
 check(s.loading.readyMs>0&&s.loading.downloadMs>0,'Missing startup measurements');
 console.log('LOAD PROFILE (real Chrome):',JSON.stringify(s.loading));

 check(s.house.hitbox.maxX>s.house.hitbox.minX&&s.house.hitbox.maxZ>s.house.hitbox.minZ,
  'House requires actual 3D bounding volume');
 // Exact GLB projection, not a rough bounding rectangle.
 const housePolygon=s.house.hitbox;
 check(housePolygon.shape==='polygon'&&housePolygon.vertexCount>=30&&
   housePolygon.polygons.length>=1,
   'House must have a genuine projected glTF mesh contour: '+
   JSON.stringify({shape:housePolygon.shape,vertices:housePolygon.vertexCount}));
 const polygonProof=await evaluate("(()=>{const b=window.__fightersQA.snapshot().house.hitbox,g=window.FightersFootprints;for(let i=1;i<20;i++)for(let j=1;j<20;j++){const p={x:b.minX+(b.maxX-b.minX)*i/20,z:b.minZ+(b.maxZ-b.minZ)*j/20};if(g.distanceTo(p,b)>.5&&window.__fightersQA.isClear(p.x,p.z))return p;}return null})()");
 check(polygonProof&&polygonProof.x>housePolygon.minX&&polygonProof.x<housePolygon.maxX,
   'Empty space INSIDE the old rectangular hitbox must now be navigable');
 console.log('PASS AUTHENTIC GLB FOOTPRINT: '+housePolygon.vertexCount+
   ' outline vertices, real concave open space '+JSON.stringify(polygonProof));
 check(s.gold.witch===2000&&s.gold.orc===900,'Starting resources');
 check(s.selectedBuilding==='witch-house','Starting house selection');
 const warcraftHud=await evaluate("(()=>{const p=document.querySelector('#command-panel').getBoundingClientRect(),m=document.querySelector('#war2-minimap').getBoundingClientRect(),top=document.querySelector('.hud').getBoundingClientRect(),buttons=[...document.querySelectorAll('#command-buttons button')].map(b=>b.getBoundingClientRect().toJSON());return {panel:p.toJSON(),minimap:m.toJSON(),top:top.toJSON(),buttons}})()");
 check(warcraftHud.panel.left<=1&&warcraftHud.panel.width<=215&&
   warcraftHud.panel.top>=30&&warcraftHud.panel.height>450&&
   warcraftHud.minimap.width>=110&&warcraftHud.minimap.height>=110&&
   warcraftHud.top.height<=42&&warcraftHud.buttons.every(b=>b.width<=65&&b.height<=52),
  'Warcraft II HUD must be a compact left sidebar, not a huge bottom panel: '+
  JSON.stringify(warcraftHud));
 const miniPan=await evaluate("(()=>{const c=document.querySelector('#war2-minimap'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('click',{clientX:r.left+r.width*.25,clientY:r.top+r.height*.25,bubbles:true}));return window.__fightersQA.snapshot().cameraCenter})()");
 check(Math.abs(miniPan.x+14)<1&&Math.abs(miniPan.z+14)<1,
  'Clicking the minimap must recenter the camera: '+JSON.stringify(miniPan));
 await evaluate("window.__fightersQA.centerCamera(-18,-14)");
 console.log('PASS WARCRAFT II DESKTOP HUD: left minimap/sidebar, thin resource bar, icon commands.');
 check(s.projection==='orthographic','Expected RTS orthographic camera');
 check(await evaluate("document.querySelector('#command-title').textContent.includes('Maison des sorcières')"),
  'Building info panel missing');
 check(await evaluate("['Ouvrière','Garde','Arcaniste'].every(name=>Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes(name)))"),
  'Three witch training roles missing from contextual panel');
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Améliorer'))"),
  'Upgrade action missing from contextual panel');
 check(await evaluate("document.querySelector('#command-icon').textContent.length>0"),
  'Contextual building portrait missing');
 // Shortcuts must keep their DOM identity throughout a long simulated match.
 check(await evaluate("['quick-home','quick-army','quick-attack','quick-stop','quick-cancel'].every(id=>!!document.getElementById(id))"),
  'Permanent quick-command bar not found');
 check(await evaluate("document.querySelector('#quick-select')===null"),'Unwanted Selection button was not removed');
 await evaluate("window.__stableQuick=document.querySelector('#quick-home');window.__stableTrain=document.querySelector('#command-buttons button')");
 const steady=await evaluate('window.__fightersQA.snapshot()');
 await evaluate('window.__fightersQA.advance(70)');
 const postSteady=await evaluate('window.__fightersQA.snapshot()');
 check(postSteady.ui.commandRebuilds-steady.ui.commandRebuilds<=1,
   'HUD rebuilt during idle match: '+JSON.stringify([steady.ui,postSteady.ui]));
 check(await evaluate("window.__stableQuick===document.querySelector('#quick-home')&&window.__stableTrain===document.querySelector('#command-buttons button')"),
   'Quick/context button DOM identity was not preserved');


 check(await evaluate("document.querySelector('#witch-faction,#orc-faction,#zoom-in,#zoom-out,.zoom-controls,#touch-hold-indicator')===null"),
  'Zoom toolbar or legacy long-press hint was not removed');
 const fixedZoom=35/3;
 check(Math.abs(steady.cameraZoom-fixedZoom)<1e-7&&
   Math.abs(steady.cameraCenter.x+18)<.05&&
   Math.abs(steady.cameraCenter.z+14)<.05,
   'Game must begin 3× closer and centered on starting witches: '+
     JSON.stringify({zoom:steady.cameraZoom,camera:steady.cameraCenter}));
 for(const code of ['Equal','NumpadAdd','Minus','NumpadSubtract']){
   await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{code:'"+code+"',bubbles:true}))");
   check(Math.abs((await evaluate('window.__fightersQA.snapshot()')).cameraZoom-fixedZoom)<1e-7,
     'Keyboard shortcut must NOT change fixed zoom: '+code);
 }
 await evaluate("document.querySelector('#viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:220,clientX:680,clientY:340,bubbles:true,cancelable:true}))");
 check(Math.abs((await evaluate('window.__fightersQA.snapshot()')).cameraZoom-fixedZoom)<1e-7&&
   !await evaluate("'zoom' in window.__fightersQA"),
   'Wheel or debug API must not modify the locked camera scale');
 await evaluate('window.__fightersQA.reset()');

 // Warcraft fog: unknown terrain is black, walking discovers it, memory persists,
 // and restarting clears every previously explored tile.
 const fogState=await evaluate('window.__fightersQA.snapshot().fog');
 check(fogState.activeFaction==='witch'&&fogState.size===112&&
   fogState.bytes===150528&&fogState.visibleCells>0&&
   fogState.exploredCells<fogState.cells/3,
   'Fog must use a compact, local starting discovery area: '+JSON.stringify(fogState));
 const hidden=await evaluate('window.__fightersQA.fogAt(22,21)');
 check(hidden.explored===0&&hidden.visible===0,
   'The enemy side must be completely unknown at match start');
 await screenshot('rts-fog-start');
 const beforeExplore=await evaluate('window.__fightersQA.fogAt(-8,-8)');
 check(beforeExplore.explored===0,'Distant central ground must begin black');
 await evaluate("window.__fightersQA.selectUnit('witch',0);window.__fightersQA.move(-8,-8);window.__fightersQA.advance(8)");
 const discovered=await evaluate('window.__fightersQA.fogAt(-8,-8)');
 check(discovered.explored>.1,
   'Walking toward a tile must reveal new terrain: '+JSON.stringify(discovered));
 const exploredCount=await evaluate('window.__fightersQA.snapshot().fog.exploredCells');
 check(exploredCount>fogState.exploredCells,'Exploration did not expand the visible map');
 await evaluate("window.__fightersQA.moveUnitTo('witch',0,-8,-8);window.__fightersQA.moveUnitTo('witch',1,-8,-8);window.__fightersQA.moveUnitTo('witch',2,-8,-8)");
 const remembered=await evaluate('window.__fightersQA.fogAt(-18,-13)');
 check(remembered.explored>0&&remembered.visible===0,
   'The explored map must persist even after scouts move away');
 const fogRendering=await evaluate('window.__fightersQA.snapshot().fog');
 check(fogRendering.exploredBrightness===1,
   'Explored terrain must stay fully visible, not darken again: '+JSON.stringify(fogRendering));
 await screenshot('rts-fog-explored');
 await evaluate('window.__fightersQA.reset()');
 check((await evaluate('window.__fightersQA.fogAt(-8,-8)')).explored===0,
   'Reset must discard exploration from the prior match');
 console.log('PASS FOG OF WAR: black unknown, reveal by walking, remembered darkness, compact buffers, reset.');

 // Real pointer events, not just QA.tap: friendly units must remain pickable
 // through fog, including when their silhouettes overlap the witch house.
 for(let i=0;i<3;i++){
   await evaluate('window.__fightersQA.selectHouse()');
   const point=await evaluate("window.__fightersQA.unitScreenPoint('witch',"+i+")");
   await call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,
     button:'left',buttons:1,clickCount:1});
   await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,
     button:'left',buttons:0,clickCount:1});
   const picked=await evaluate('window.__fightersQA.snapshot()');
   check(picked.selectedIds.length>0&&picked.selectedBuildingId===null,
     'Real mouse click on a friendly unit selected the house or empty ground: '+
       JSON.stringify({i,point,selected:picked.selectedIds,building:picked.selectedBuildingId}));
 }
 const ringStyle=await evaluate('window.__fightersQA.snapshot().selectionRingStyle');
 check(ringStyle.depthTest===false&&ringStyle.renderOrder>=10,
   'Selection circles must render on top of paved ground and character feet: '+JSON.stringify(ringStyle));
 await screenshot('rts-selection-ring-prominent');
 await evaluate('window.__fightersQA.reset()');
 console.log('PASS FRIENDLY UNIT TAPS: mouse events and prominent, unobstructed selection rings.');

 // Building taps must hit the actual flat X/Z polygon, never the larger
 // projected 3D visual AABB or a roof overhang.
 await evaluate("window.__fightersQA.centerCamera("+
   ((housePolygon.minX+housePolygon.maxX)/2)+","+
   ((housePolygon.minZ+housePolygon.maxZ)/2)+")");
 const miss=await evaluate("window.__fightersQA.groundScreenPoint("+
   polygonProof.x+","+polygonProof.z+")");
 await evaluate("window.__fightersQA.tap("+miss.x+","+miss.y+")");
 check((await evaluate('window.__fightersQA.snapshot()')).selectedBuildingId!==s.house.id,
   'Tap inside old AABB but outside real GLB footprint selected the house');
 const hit=await evaluate("window.__fightersQA.buildingScreenPoint("+JSON.stringify(s.house.id)+")");
 check(hit&&Number.isFinite(hit.x),'Cannot project an interior point of the real footprint');
 await evaluate("window.__fightersQA.tap("+hit.x+","+hit.y+")");
 check((await evaluate('window.__fightersQA.snapshot()')).selectedBuildingId===s.house.id,
   'Tap inside true GLB X/Z footprint must select the house');
 await evaluate("window.__fightersQA.centerCamera(-18,-14)");
 console.log('PASS PRECISE BUILDING TAPS: inside actual X/Z polygon selects; empty former AABB does not.');

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
 check(s.buildings.filter(b=>b.clanId==='orcs').length===5&&
  s.buildings.some(b=>b.id==='neutral-gold-mine'),
  'Five orc buildings plus neutral witch-side gold deposit');
 check(s.buildings.every(b=>b.hitbox.maxX>b.hitbox.minX&&b.hitbox.maxZ>b.hitbox.minZ),
  'Every orc structure must have a real 3D collider');
 check(s.buildings.every(b=>b.healthbarParent==='scene'),
   'Orc HP bars must not inherit a building rotation/scale');
 check(s.buildings.every(b=>b.healthbarPosition[1]>b.hitbox.maxY),
   'Orc HP bars must be above building top');

 await evaluate("window.__fightersQA.setFaction('orc');window.__fightersQA.selectOrcBarrack()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.selectedBuilding==='barrack','Orc barrack contextual selection');
 check(await evaluate("['Ouvrier','Guerrier','Lanceur'].every(name=>Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes(name)))"),
  'Orc barrack must produce all three role types');
 check(await evaluate("window.__fightersQA.trainOrc()"),'Orc production refused');
 await evaluate('window.__fightersQA.advance(4.6)');
 check((await evaluate('window.__fightersQA.snapshot()')).orcs.length===5,
  'Orc barrack training queue failed');
 check(!await evaluate("window.__fightersQA.beginBuild('mine')")&&
   !await evaluate("window.__fightersQA.build('mine',9,7)"),
   'A natural mine must NEVER be constructible by a player');
 // Routine RTS messages are tiny white-on-black toasts literally at the
 // screen bottom and never overlaid in giant typography on the battlefield.
 const notice=await evaluate("(()=>{const el=document.querySelector('#banner'),s=getComputedStyle(el),r=el.getBoundingClientRect();return {text:el.textContent,font:parseFloat(s.fontSize),color:s.color,bg:s.backgroundColor,bottom:innerHeight-r.bottom,z:Number(s.zIndex),opacity:parseFloat(s.opacity)}})()");
 check(notice.text==='ORC FORMÉ'&&notice.font<=11&&
   notice.color==='rgb(255, 255, 255)'&&notice.bg==='rgb(0, 0, 0)'&&
   notice.bottom>=0&&notice.bottom<=38&&notice.z>7&&notice.opacity>.1,
   'Training notice must be tiny white-on-black at bottom: '+JSON.stringify(notice));
 const cssAnimation=await evaluate("(()=>{const e=document.querySelector('#banner'),s=getComputedStyle(e);return {name:s.animationName,duration:parseFloat(s.animationDuration)}})()");
 check(cssAnimation.name==='tiny-rts-toast'&&cssAnimation.duration<=.65,
   'Notification must use a 600ms compositor animation: '+JSON.stringify(cssAnimation));
 // Headless SwiftShader can defer animation start while its main thread is
 // saturated by WebGL; enforce the authored 600ms duration, and confirm the
 // animation finishes rather than treating CI scheduling as user-visible time.
 await until("parseFloat(getComputedStyle(document.querySelector('#banner')).opacity)<.02",
   'CSS notification fade-out',6000);

 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Construire'))"),
   'Orc construct command missing');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.textContent.includes('Construire'))?.click()");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Hutte'))"),
   'Build catalog did not open');
 check(!await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Mine'))"),
   'Construction palette must not offer mine deposits');
 await evaluate("document.querySelector('#quick-cancel').click();window.__fightersQA.selectOrcBarrack()");



 check(await evaluate("window.__fightersQA.beginBuild('hut')"),'Hut placement action refused');
 check(await evaluate("!!window.__fightersQA.build('hut',8,-10)"),'Orc hut construction failed');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.every(b=>b.hitbox.shape==='polygon'&&b.hitbox.vertexCount>10),
   'Orc buildings must all use real GLB-projected multi-polygons');
 check(s.buildings.length===7&&s.buildings.filter(b=>b.type==='hut').length===2,
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

 // Tap the projected real ground polygon, never the oversized 3D roof AABB.
 const clicked=await evaluate("(function(){const s=window.__fightersQA.snapshot();const b=s.buildings.find(b=>!b.initial);const p=window.__fightersQA.buildingScreenPoint(b.id);window.__fightersQA.tap(p.x,p.y);return window.__fightersQA.snapshot().selectedBuildingId===b.id})()");
 check(clicked,'Exact building X/Z polygon picking failed');
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
 check(mobile.panel.width<=mobile.width&&mobile.panel.bottom<=mobile.height+1&&
   mobile.panel.height<=168&&mobile.panel.top>=mobile.height-170,
  'Mobile command panel must be a compact strip, not a huge sheet: '+
  JSON.stringify(mobile.panel));
 const mobileMini=await evaluate("(()=>{const m=document.querySelector('#war2-minimap').getBoundingClientRect(),buttons=[...document.querySelectorAll('#command-buttons button')].map(b=>b.getBoundingClientRect().toJSON());return {map:m.toJSON(),buttons}})()");
 check(mobileMini.map.width>=40&&mobileMini.map.height>=40&&
   mobileMini.buttons.every(b=>b.width>=32&&b.height<=35&&
     b.left>=0&&b.right<=mobile.width),
   'Mobile minimap or icon grid overflowed: '+JSON.stringify(mobileMini));
 console.log('PASS WARCRAFT II MOBILE HUD: compact bottom strip, tappable minimap, three-column icons.');
 check(mobile.pause.width>0,'Compact pause button missing');
 await screenshot('rts-mobile-command-panel');
 const framing=await evaluate("(()=>{const hero=document.querySelector('.hero-hud').getBoundingClientRect();const score=document.querySelector('.score').getBoundingClientRect();const pause=document.querySelector('#pause').getBoundingClientRect();return {hero:{right:hero.right,bottom:hero.bottom},score:{left:score.left,right:score.right},pause:{left:pause.left,right:pause.right}}})()");
 check(framing.hero.right<=framing.score.left+3&&framing.score.right<=framing.pause.left+4&&
  framing.pause.right<=mobile.width+1,'Compact mobile HUD overlaps: '+JSON.stringify(framing));
 // Two real simultaneous touch pointers form a rectangle immediately.
 // The old hold-to-select and pinch-to-zoom paths are intentionally gone.
 await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const touch=(id,x,y)=>({id,x,y,force:1,radiusX:4,radiusY:4});
 const fixedMobileZoom=35/3;
 await evaluate("window.__fightersQA.reset();window.__fightersQA.centerCamera(-18,-14)");
 let selectionBefore=await evaluate('window.__fightersQA.snapshot()');
 const witchScreen=await evaluate("Array.from({length:3},(_,i)=>window.__fightersQA.unitScreenPoint('witch',i))");
 const panelTop=await evaluate("document.querySelector('#command-panel').getBoundingClientRect().top");
 const bound={
   x1:Math.max(16,Math.floor(Math.min(...witchScreen.map(p=>p.x))-21)),
   y1:Math.max(115,Math.floor(Math.min(...witchScreen.map(p=>p.y))-21)),
   x2:Math.min(374,Math.ceil(Math.max(...witchScreen.map(p=>p.x))+21)),
   y2:Math.ceil(Math.max(...witchScreen.map(p=>p.y))+21)
 };
 console.log('MOBILE TWO-FINGER BOUNDS:',JSON.stringify({witchScreen,bound,panelTop,zoom:selectionBefore.cameraZoom}));
 check(bound.x2>bound.x1+25&&bound.y2>bound.y1+25&&bound.y2<panelTop-6,
   '3 starting witches must be visible at fixed 3× zoom: '+JSON.stringify({witchScreen,bound,panelTop}));
 // A true single-finger tap must select a witch, never the building behind it.
 const singleTouch=touch(77,witchScreen[2].x,witchScreen[2].y);
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[singleTouch]});
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const oneTap=await evaluate('window.__fightersQA.snapshot()');
 check(oneTap.selectedIds.length>0&&oneTap.selectedBuildingId===null,
   'A single mobile tap on a witch selected the house or nothing: '+
     JSON.stringify({point:singleTouch,selected:oneTap.selectedIds,building:oneTap.selectedBuildingId,
       gesture:oneTap.touchGesture}));
 console.log('PASS MOBILE SINGLE TAP: physical touch events select a friendly witch.');
 await evaluate('window.__fightersQA.reset()');
 const first=touch(1,bound.x1,bound.y1),second=touch(2,bound.x1+22,bound.y1+22);
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first,second]});
 let boxState=await evaluate('window.__fightersQA.snapshot()');
 check(boxState.activeTouches===2&&boxState.touchGesture==='two-finger-select'&&
   boxState.selectionRectangleVisible&&boxState.twoFingerSelection,
   'Two fingers must show a rectangle IMMEDIATELY, without a long press: '+JSON.stringify(boxState));
 const cameraBeforeBox={...boxState.cameraCenter};
 const boxMove=[first,touch(2,bound.x2,bound.y2)];
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:boxMove});
 boxState=await evaluate('window.__fightersQA.snapshot()');
 check(boxState.selectionRectangleVisible&&
   Math.abs(boxState.twoFingerSelection.b.x-bound.x2)<1&&
   Math.abs(boxState.twoFingerSelection.b.y-bound.y2)<1,
   'Two-finger rectangle must follow both live fingertips: '+
     JSON.stringify(boxState.twoFingerSelection));
 check(Math.abs(boxState.cameraZoom-fixedMobileZoom)<1e-7&&
   Math.hypot(boxState.cameraCenter.x-cameraBeforeBox.x,
     boxState.cameraCenter.z-cameraBeforeBox.z)<.05,
   'Spreading two fingers must SELECT, not zoom or pan the camera');
 // End both touches at once, as the iPhone can; selection must survive the
 // multiple pointerup events and no surviving finger may trigger a tap.
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 boxState=await evaluate('window.__fightersQA.snapshot()');
 check(!boxState.selectionRectangleVisible&&boxState.activeTouches===0&&
   boxState.selectedIds.length===3&&boxState.visibleSelectionRings===3&&
   boxState.touchGestureCounters.boxes>0,
   'Two-finger rectangle failed to select three actual witches: '+JSON.stringify({
     selected:boxState.selectedIds,rings:boxState.visibleSelectionRings,
     gesture:boxState.touchGesture,counters:boxState.touchGestureCounters,witchScreen,bound
   }));
 await screenshot('rts-mobile-two-finger-selected-witches');
 console.log('PASS MOBILE TWO-FINGER SELECT: 3/3 witches selected; zoom unchanged at 35/3.');

 // iPhone users rarely lift both fingers simultaneously. The FIRST release
 // must finish the selection; movement from the finger left on-screen must
 // never become an unintended pan, tap, or attack command.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.centerCamera(-18,-14)");
 const firstLiftStart=touch(9,bound.x1,bound.y1);
 const secondLiftEnd=touch(10,bound.x2,bound.y2);
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
   firstLiftStart,touch(10,bound.x1+22,bound.y1+22)
 ]});
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[firstLiftStart,secondLiftEnd]});
 const staggeredCamera=(await evaluate('window.__fightersQA.snapshot()')).cameraCenter;
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[secondLiftEnd]});
 let staggered=await evaluate('window.__fightersQA.snapshot()');
 check(staggered.selectedIds.length===3&&staggered.activeTouches===1&&
   !staggered.selectionRectangleVisible,
   'First finger release must finalize the box even if the other finger remains: '+JSON.stringify(staggered));
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(10,bound.x2+35,bound.y2+10)]});
 staggered=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(staggered.cameraCenter.x-staggeredCamera.x,
   staggered.cameraCenter.z-staggeredCamera.z)<.05&&
   staggered.selectedIds.length===3,
   'Remaining touch after box select must not turn into a camera pan');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 staggered=await evaluate('window.__fightersQA.snapshot()');
 check(staggered.activeTouches===0&&staggered.selectedIds.length===3&&
   staggered.visibleSelectionRings===3,
   'Lifting second finger must not issue an accidental tap/order');
 console.log('PASS STAGGERED TWO-FINGER RELEASE: finalize on first lift, no pan/tap from remaining finger.');


 // A single finger may still drag the camera but cannot select a group.
 await evaluate('window.__fightersQA.centerCamera(0,0)');
 const beforeSinglePan=await evaluate('window.__fightersQA.snapshot()');
 await call('Input.dispatchTouchEvent',{type:'touchStart',
   touchPoints:[touch(4,155,310)]});
 await call('Input.dispatchTouchEvent',{type:'touchMove',
   touchPoints:[touch(4,220,355)]});
 await sleep(80);
 const afterSinglePan=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(afterSinglePan.cameraCenter.x-beforeSinglePan.cameraCenter.x,
   afterSinglePan.cameraCenter.z-beforeSinglePan.cameraCenter.z)>.2,
   'One-finger drag must continue to pan the map: '+
     JSON.stringify({before:beforeSinglePan.cameraCenter,after:afterSinglePan.cameraCenter}));
 check(afterSinglePan.selectedIds.join(',')===beforeSinglePan.selectedIds.join(',')&&
   Math.abs(afterSinglePan.cameraZoom-fixedMobileZoom)<1e-7,
   'One-finger pan changed the selected group or fixed zoom');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

 // One-finger HOLD is not selection anymore. A stationary hold on empty
 // ground must not display a selection rectangle or alter the group.
 await evaluate("window.__fightersQA.centerCamera(-18,-14)");
 const beforeHold=await evaluate('window.__fightersQA.snapshot()');
 await call('Input.dispatchTouchEvent',{type:'touchStart',
   touchPoints:[touch(7,335,340)]});
 await sleep(1150);
 const afterHold=await evaluate('window.__fightersQA.snapshot()');
 check(!afterHold.selectionRectangleVisible&&afterHold.touchGesture==='tap'&&
   afterHold.selectedIds.join(',')===beforeHold.selectedIds.join(','),
   'One-finger long press must NOT start rectangle selection');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 await screenshot('rts-mobile-fixed-camera');
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
 check(s.house.level===1&&s.buildings.length===6,'Reset starting buildings');
 // A witch worker can mine a neutral deposit; soldiers cannot mine, and
 // workers cannot attack buildings. Collection requires physical contact.
 const hutForWorker=s.buildings.find(b=>b.type==='hut').id;
 await evaluate("window.__fightersQA.selectUnit('witch',1)");
 check(!await evaluate('window.__fightersQA.attackBuilding('+JSON.stringify(hutForWorker)+')'),
  'A worker must not be assigned combat orders');
 check(!await evaluate("window.__fightersQA.orderMine('witch',0,'neutral-gold-mine')"),
  'Melee fighter must not mine gold');
 await evaluate("window.__fightersQA.selectUnit('witch',0)");
 check(!await evaluate("window.__fightersQA.attackBuilding('neutral-gold-mine')"),
  'Neutral mineral deposits must not become hostile combat targets');
 const witchGoldBefore=s.gold.witch;
 check(await evaluate("window.__fightersQA.orderMine('witch',1,'neutral-gold-mine')"),
  'Witch worker could not take a mine job');
 await evaluate('window.__fightersQA.advance(38)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.gold.witch>witchGoldBefore&&s.mining.totalMinedGold>0,
  'Witch worker never mined physical gold: '+JSON.stringify(s.mining));
 check(s.mining.workers.every(u=>u.role==='worker'),
  'Non-worker character was assigned mining');
 // A construction order debits once, sends the worker to the real X/Z
 // perimeter and creates the structure only after its work animation.
 const site=await evaluate("(()=>{for(let z=-12;z>=-17;z-=2)for(let x=-8;x>=-16;x-=2)if(window.__fightersQA.canBuild(x,z,'witch-house'))return {x,z};return null})()");
 check(site,'No safe witch house construction site');
 const buildingsBefore=s.buildings.length,goldBeforeBuild=s.gold.witch;
 check(await evaluate('window.__fightersQA.orderBuild("witch-house",'+site.x+','+site.z+')'),
  'Witch worker could not start a construction job');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===buildingsBefore&&s.construction.length===1&&
  s.gold.witch===goldBeforeBuild-230,'Construction must reserve resources and wait for worker');
 await evaluate('window.__fightersQA.advance(38)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.construction.length===0&&s.buildings.length===buildingsBefore+1&&
  s.buildings.some(b=>b.type==='witch-house'&&b.clanId==='witch'),
  'Witch worker did not finish a real house: '+JSON.stringify(s.construction));
 console.log('PASS ECONOMIC ROLES: witch mined gold, constructed a shared-model house; soldiers cannot mine, workers cannot fight.');
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===6,'Reset must remove the additional witch house');
 check(await evaluate('window.__fightersQA.isClear(8,-10)'),
  'Reset must remove constructed building hitboxes');

 // First tap selects a witch, second tap directly attacks the enemy building.
 const hutId=(await evaluate('window.__fightersQA.snapshot()')).buildings.find(b=>b.type==='hut').id;
 await evaluate("window.__fightersQA.reset();window.__fightersQA.centerCamera(-18,-14)");
 const witchPoint=await evaluate("window.__fightersQA.unitScreenPoint('witch',0)");
 check(witchPoint&&Number.isFinite(witchPoint.x),'Cannot project witch');
 await evaluate("window.__fightersQA.tap("+witchPoint.x+","+witchPoint.y+")");
 let tapState=await evaluate('window.__fightersQA.snapshot()');
 check(tapState.selectedIds.length===1&&
   tapState.witches.find(u=>u.id===tapState.selectedIds[0])?.role==='melee',
   'First tap must select the melee witch: '+JSON.stringify({selected:tapState.selectedIds,witches:tapState.witches.map(u=>({id:u.id,role:u.role}))}));
 await evaluate("window.__fightersQA.centerCamera(22,21)");
 const targetPoint=await evaluate("window.__fightersQA.buildingScreenPoint("+JSON.stringify(hutId)+")");
 check(targetPoint&&Number.isFinite(targetPoint.x),'Cannot project hut');
 await evaluate("window.__fightersQA.tap("+targetPoint.x+","+targetPoint.y+")");
 tapState=await evaluate('window.__fightersQA.snapshot()');
 check(tapState.witches.find(u=>u.id===tapState.selectedIds[0])?.attackTargetId!==hutId,
   'Invisible enemy building must not be targetable through black fog');
 // Scout with a different witch. The selected melee fighter can remain
 // far away, so clicking the hut cannot accidentally select the scout.
 await evaluate("window.__fightersQA.moveUnitTo('witch',1,18.5,21)");
 check((await evaluate('window.__fightersQA.fogAt(22,21)')).visible>.2,
   'Scout next to enemy hut must reveal the target');
 await evaluate("window.__fightersQA.tap("+targetPoint.x+","+targetPoint.y+")");
 tapState=await evaluate('window.__fightersQA.snapshot()');
 check(tapState.witches.find(u=>u.id===tapState.selectedIds[0])?.attackTargetId===hutId,
   'Second tap did not order witch to destroy enemy building: '+
     JSON.stringify({selected:tapState.selectedIds,
       witches:tapState.witches.map(u=>({id:u.id,role:u.role,attack:u.attackTargetId})),
       building:tapState.selectedBuildingId}));
 check(await evaluate("document.querySelector('.order-ping.attack')!==null"),
   'Attack order needs a red fading reticle');
 await until("window.__fightersQA.snapshot().ui.activePings===0",'red order reticle cleanup',10000);
 await evaluate('window.__fightersQA.reset()');

 // Real native animation, target acquisition, damage and destruction.
 await evaluate("window.__fightersQA.passive('orc');window.__fightersQA.selectUnit('witch',0)");

 await evaluate("window.__fightersQA.moveUnitTo('witch',0,18.5,21)");
 check(await evaluate("window.__fightersQA.attackBuilding("+JSON.stringify(hutId)+")"),
  'Attack-building order was rejected');
 await evaluate('window.__fightersQA.advance(4)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const hutBefore=s.buildings.find(b=>b.id===hutId);
 const attackingWitch=s.witches[0];
 const h=hutBefore.hitbox,dx=(h.minX+h.maxX)/2-attackingWitch.x,
   dz=(h.minZ+h.maxZ)/2-attackingWitch.z,
   actorToWall=await evaluate("window.FightersFootprints.distanceTo("+
     JSON.stringify({x:attackingWitch.x,z:attackingWitch.z})+","+
     "window.__fightersQA.snapshot().buildings.find(b=>b.id==="+
     JSON.stringify(hutId)+").hitbox)");
 check(actorToWall<.98,
   'Witch is still striking metres away from the hut border: '+JSON.stringify({attackingWitch,h}));
 check((dx*attackingWitch.heading.x+dz*attackingWitch.heading.z)/Math.hypot(dx,dz)>.93,
   'Witch must face the centre of the attacked building');
 await evaluate('window.__fightersQA.advance(13)');
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
 await evaluate('window.__fightersQA.advance(3)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const orcAtHouse=s.orcs[0],houseBox=s.house.hitbox;
 const xh=(houseBox.minX+houseBox.maxX)/2-orcAtHouse.x,
   zh=(houseBox.minZ+houseBox.maxZ)/2-orcAtHouse.z;
 check(Math.hypot(Math.max(houseBox.minX-orcAtHouse.x,0,orcAtHouse.x-houseBox.maxX),
   Math.max(houseBox.minZ-orcAtHouse.z,0,orcAtHouse.z-houseBox.maxZ))<1.02,
   'Orc still attacks the witch house from too far away: '+JSON.stringify(orcAtHouse));
 check((xh*orcAtHouse.heading.x+zh*orcAtHouse.heading.z)/Math.hypot(xh,zh)>.93,
   'Attacking orc must look at the centre of witch house: '+JSON.stringify(orcAtHouse));
 await evaluate('window.__fightersQA.advance(13)');
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
 for(const worker of s.mining.workers.filter(w=>w.progress>.1)){
   const mine=s.buildings.find(b=>b.id===worker.mineId),h=mine?.hitbox;
   check(!!h,'Mine worker has no physical deposit');
   const gap=await evaluate("window.FightersFootprints.distanceTo("+
     JSON.stringify({x:worker.x,z:worker.z})+","+
     "window.__fightersQA.snapshot().buildings.find(b=>b.id==="+
     JSON.stringify(worker.mineId)+").hitbox)");
   check(gap<.85,'Miner collected gold far from physical mine boundary: '+
     JSON.stringify({worker,mine:h,gap}));
 }
 check(!s.orcAI.decisions.some(a=>a.type==='build'&&a.building==='mine'),
   'AI illegally constructed a mineral deposit');

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
 let a=s.witches[0],b=s.witches[1];
 check(Math.hypot(a.x-b.x,a.z-b.z)>.55,
   'Soft separation failed to start after 250ms: '+JSON.stringify([a,b]));
 await evaluate('window.__fightersQA.advance(.65)');
 s=await evaluate('window.__fightersQA.snapshot()');
 a=s.witches[0];b=s.witches[1];
 check(Math.hypot(a.x-b.x,a.z-b.z)>=.87,
   'Idle witches did not spread into available space within one second: '+JSON.stringify([a,b]));
 await evaluate('window.__fightersQA.selectWitches();window.__fightersQA.move(-5,-4);window.__fightersQA.advance(8)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const living=s.witches;
 for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++)
  check(Math.hypot(living[i].x-living[j].x,living[i].z-living[j].z)>=.87,
    'Moving witches overlapped physical footprint');

 // Regression: twenty independently trained-model witches must not orbit
 // duplicate formation goals indefinitely near other witches.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.passive('orc')");
 check(await evaluate("window.__fightersQA.spawnWitches(20)")===20,
   'Failed to spawn twenty native-rig witches for crowd regression');
 await evaluate("window.__fightersQA.selectWitches();window.__fightersQA.move(-8,-4)");
 s=await evaluate('window.__fightersQA.snapshot()');
 const crowd=s.witches,goals=crowd.map(w=>w.destination);
 if(goals.some(goal=>!goal)){
   const stranded=await evaluate("window.__fightersQA.snapshot().witches.filter(w=>!w.destination).map(w=>({id:w.id,x:w.x,z:w.z,clear:window.__fightersQA.isClear(w.x,w.z),canReachCentre:!!window.__fightersQA.route({x:w.x,z:w.z},{x:0,z:0})}))");
   console.log('UNREACHABLE FORMATION STARTS:',JSON.stringify(stranded));
 }
 check(goals.length===20&&goals.every(g=>g&&Number.isFinite(g.x))&&
   new Set(goals.map(p=>p.x.toFixed(3)+','+p.z.toFixed(3))).size===20,
   'Multiple witches were assigned the same formation location: '+JSON.stringify(goals));
 await evaluate('window.__fightersQA.advance(21)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.filter(w=>w.destination).length===0,
   'Some of the twenty witches are still walking forever: '+
     JSON.stringify(s.witches.filter(w=>w.destination)));
 const arrived=s.witches.map(w=>({id:w.id,x:w.x,z:w.z,animation:w.animation}));
 await evaluate('window.__fightersQA.advance(7)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.every(w=>!w.destination&&w.animation!=='Walk_Loop')&&
   s.witches.every((w,i)=>Math.hypot(w.x-arrived[i].x,w.z-arrived[i].z)<.35),
   'Crowd is still walking/oscillating after arrival: '+JSON.stringify(s.witches));
 console.log('PASS twenty witches: 20 distinct goals, complete arrival, idle and stable positions.');

 await evaluate('window.__fightersQA.enableOrcAI(false);window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4&&
  s.buildings.filter(b=>!b.destroyed).length===6,'Reset after AI restores starting match');
 check(!errors.length,'Browser JavaScript exceptions: '+errors.join(' | '));
 console.log('PASS RTS: stable HUD, persistent shortcuts, blue/red reticles, two-tap attacks, one-finger pan, instant two-finger box selection, locked 3× zoom, destroyed buildings and strategic AI.');

}
try{await run();}finally{try{socket?.close();}catch{}chrome.kill();try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:350});}catch(error){console.warn('Chrome profile cleanup only:',error.message);}}
