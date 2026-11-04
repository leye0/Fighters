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
 await until('window.__fightersQA.snapshot().forest.loadedSpecies===2',
   'two real CC0 red/dead tree GLBs with WebP textures',30000);
 await until('window.__fightersQA.snapshot().ravens.loaded===true',
   'real locally compressed animated crow GLB',30000);
 const ravens=await evaluate('window.__fightersQA.snapshot().ravens');
 check(ravens.animated===2&&ravens.birds.length===2&&
   ravens.birds.every(b=>b.y>3.5),
   'Two real animated ravens must fly or perch above the ground: '+JSON.stringify(ravens));
 const forest=await evaluate('window.__fightersQA.snapshot().forest');
 check(forest.instances===55&&forest.obstacleCount===55&&forest.visibleInViewport>=3,
   'At least three real trees must be revealed and on screen at witch spawn: '+JSON.stringify(forest));
 console.log('PASS FOREST BROWSER:',JSON.stringify(forest));
 await screenshot('rts-forest-start');
 // Play through the actual Start button: ?qa otherwise skips the
 // user gesture and never unlocks either AudioContext.
 await evaluate("document.querySelector('#overlay').hidden=false");
 const startRect=await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
 await call('Input.dispatchMouseEvent',{type:'mousePressed',x:startRect.x,y:startRect.y,button:'left',clickCount:1});
 await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:startRect.x,y:startRect.y,button:'left',clickCount:1});
 await until("window.__fightersQA.witchSound().contextState==='running'",'user-unlocked Witch AudioContext',10000);
 await until("window.__fightersQA.witchSound().available.interaction>0",'Witch MP3 manifest',10000);
 await until("window.__fightersQA.sound().available.short>0",'Orc MP3 manifest',10000);
 await evaluate("window.__fightersQA.selectUnit('witch',0)");
 // On cold SwiftShader runs, the first MP3 decode can arrive after the
 // engine's 1.8s freshness window. Reissue the real selection, as for Orcs.
 for(let retry=0;retry<4&&!await evaluate('window.__fightersQA.witchSound().played>0');retry++){
   await sleep(1200);
   await evaluate("window.__fightersQA.selectUnit('witch',0)");
 }
 check(await evaluate('window.__fightersQA.witchSound().played>0'),
   'Real decoded Witch interaction SFX never played: '+JSON.stringify(await evaluate('window.__fightersQA.witchSound()')));
 await evaluate("window.__fightersQA.setFaction('orc');window.__fightersQA.selectUnit('orc',0)");
 await evaluate("window.__fightersQA.centerCamera(15,18)");
 const orcForest=await evaluate('window.__fightersQA.snapshot().forest');
 check(orcForest.visibleInViewport>=1,
   'Actual orc start must reveal at least one tree, not an empty map: '+JSON.stringify(orcForest));
 await screenshot('rts-forest-orc');
 // SwiftShader can make the first MP3 decode exceed the voice engine's 1.8s
 // freshness limit. Once decoded it stays cached; a subsequent genuine order
 // should play. Reissue selection briefly instead of treating a cold decode
 // dropped on purpose as a missing audio implementation.
 await until("window.__fightersQA.sound().contextState==='running'",'user-unlocked Orc AudioContext',10000);
 for(let retry=0;retry<4&&!await evaluate('window.__fightersQA.sound().played>0');retry++){
   await sleep(1200);
   await evaluate("window.__fightersQA.selectUnit('orc',0)");
 }
 check(await evaluate('window.__fightersQA.sound().played>0'),
   'Real decoded Orc interaction SFX never played: '+JSON.stringify(await evaluate('window.__fightersQA.sound()')));
 console.log('PASS WEB AUDIO BROWSER SMOKE:',JSON.stringify(await evaluate(
   '({witch:window.__fightersQA.witchSound(),orc:window.__fightersQA.sound()})')));
 await evaluate("window.__fightersQA.reset()");
 let s=await evaluate('window.__fightersQA.snapshot()');
 await evaluate('window.__fightersQA.selectRaven(0)');
 check((await evaluate('window.__fightersQA.snapshot().ravens.selectedId'))==='raven-1'&&
   await evaluate('document.querySelector("#command-title").textContent')==='Corbeau familier'&&
   await evaluate('Array.from(document.querySelectorAll("#command-buttons button")).some(b=>b.textContent.includes("Déplacer"))'),
   'Selecting a raven must expose its own Move command, independent of witches');
 await evaluate('window.__fightersQA.sendRaven(7,7);window.__fightersQA.advance(6)');
 check((await evaluate('window.__fightersQA.fogAt(7,7,"witch").explored'))>.2,
   'The commanded raven must uncover a small patch of the witches fog');
 check((await evaluate('window.__fightersQA.minimapGroundVisibilityAt(7,7)'))===0,
   'Raven-only fog vision must not reveal the bird position on the minimap');
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4,'Starting troops');
 check(s.wood.witch===250&&s.wood.orc===350,'Wood reserve must belong to each faction');
 check(s.witches.map(u=>u.role).join(',')==='melee,worker,ranged',
  'Witches must start with worker, melee and ranged roles');
 check(s.orcs.map(u=>u.role).join(',')==='melee,worker,ranged,melee',
  'Orcs must start with one worker and two distinct fighter types');
 check(s.assets.sourceRigs===2&&s.assets.roleModelsLoaded===0,
  'Six roles must use only the two Quaternius rigs');
  check(s.witches[1].workTool==='Worker_Scythe'&&!s.witches[1].workToolVisible&&
    s.orcs[1].workTool==='Worker_Axe'&&!s.orcs[1].workToolVisible&&
    [s.witches[1],s.orcs[1]].every(u=>u.hammerTool==='Worker_Hammer'&&!u.hammerToolVisible)&&
    [...s.witches,...s.orcs].filter(u=>u.role!=='worker').every(u=>!u.workTool&&!u.hammerTool),
    'Only workers should carry hidden shared job tools before working');
 for(const clan of ['witch','orc']){
  const sharing=await evaluate('window.__fightersQA.auditRigSharing('+JSON.stringify(clan)+')');
  check(sharing.bodyGeometryShared&&sharing.outfitGeometryShared&&
    sharing.roles.length===3,'Role outfits must share body and garment geometry: '+
    JSON.stringify(sharing));
 }
 check(s.assets.sharedMaterials<120,
  'Too many cosmetic materials: '+s.assets.sharedMaterials);
 console.log('PASS SIX CHARACTER ROLES: shared bodies and costume geometry, separate worker/melee/ranged stats.');
 await until('window.__fightersQA.snapshot().crops.loaded',
   'real six-stage source model for wheat and wild berry bushes',30000);
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.crops.templates===6&&s.berries.count===28&&s.berries.real&&s.berries.batches>0&&
   s.berries.forageSight===3&&
   s.berries.bushes.every(b=>b.stage===1&&b.rendered&&b.scale>=.48&&b.scale<.63),
   'Wild shrubs must use instanced original Tomatoe_F1..F3 models: '+JSON.stringify(s.berries));
 const initialBerry=s.berries.bushes[0];
 check(await evaluate('window.__fightersQA.isClear('+initialBerry.x+','+(initialBerry.z-1.5)+')'),
   'First wild berry should have a navigable approach from the witch glade');
 await evaluate('window.__fightersQA.setBerryStage(0,3);window.__fightersQA.advance(1.2)');
 check((await evaluate('window.__fightersQA.snapshot().berries.foragers')).length===0,
   'Wild berry must not lure idle witches from beyond the 3-unit foraging radius');
 await evaluate('window.__fightersQA.moveUnitTo("witch",0,'+initialBerry.x+','+
   (initialBerry.z-1.5)+')');
 const berryFeeding=await evaluate("(()=>{let bent=false,approached=false;for(let i=0;i<110;i++){"+
   "window.__fightersQA.advance(.1);const s=window.__fightersQA.snapshot();"+
   "const w=s.witches[0],b=s.berries.bushes[0];"+
   "if(w?.berryTarget===0&&w.animation==='Farm_Harvest'&&!w.workToolVisible&&"+
   "!w.hammerToolVisible){bent=true;approached ||= Math.hypot(w.x-b.x,w.z-b.z)<.8;}"+
   "if(s.berries.eaten>0&&b.stage===1)return {bent,approached,s};"+
   "}return {bent,approached,s:window.__fightersQA.snapshot()};})()");
 check(berryFeeding.bent&&berryFeeding.approached&&berryFeeding.s.berries.eaten>0&&
   berryFeeding.s.berries.bushes[0].stage===1&&
   berryFeeding.s.farming.foragedFood>=3&&
   berryFeeding.s.buildings.every(b=>!b.id.startsWith('berry-')),
   'Witch must automatically reach, bend and eat ripe wild berries: '+JSON.stringify(berryFeeding));
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.berries.eaten===0&&s.berries.foragers.length===0&&
   s.berries.bushes.every(b=>b.stage===1&&b.rendered),
   'Reset must restore all berry shrubs and their visual stages');
 console.log('PASS WILD BERRIES: small shrubs, 3-unit auto-detection, walk/bend/eat, food and reset.');
 // A visible orc should not pull grouped witch fighters away from one another.
 await evaluate("window.__fightersQA.passive('orc');window.__fightersQA.enableOrcAI(false)");
 const guardSpot=await evaluate("(()=>{for(const [x,z] of [[-14,-13],[-14,-12],[-15,-11],[-13,-13]])"+
   "if(window.__fightersQA.isClear(x,z))return {x,z};return null})()");
 check(guardSpot,'No clear enemy observation point near the witch formation');
 await evaluate("window.__fightersQA.moveUnitTo('orc',0,"+guardSpot.x+","+guardSpot.z+")");
 const guardBefore=await evaluate('window.__fightersQA.snapshot()');
 await evaluate('window.__fightersQA.advance(1.5)');
 const guardAfter=await evaluate('window.__fightersQA.snapshot()');
 check(guardAfter.witches.filter(u=>u.role!=='worker').every(u=>{
   const start=guardBefore.witches.find(v=>v.id===u.id);
   return Math.hypot(u.x-start.x,u.z-start.z)<.35;
 }), 'Grouped witch fighters must hold ground when they spot an enemy');
 await evaluate("window.__fightersQA.selectUnit('witch',0);window.__fightersQA.attackUnit("+
   guardAfter.orcs[0].id+");window.__fightersQA.advance(.5)");
 const ordered=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(ordered.witches[0].x-guardAfter.witches[0].x,
   ordered.witches[0].z-guardAfter.witches[0].z)>.3,
   'An explicit attack order must override defensive holding');
 await evaluate("window.__fightersQA.reset();window.__fightersQA.passive(null);window.__fightersQA.enableOrcAI(true)");
 console.log('PASS WITCH GROUP DEFENSE: hold on sight, attack on command.');
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

 await until('window.__fightersQA.snapshot().forest.woodBundleLoaded',
   'real licensed low-poly log bundle model',30000);
 // A real tap on a tree (not a building) orders either faction's worker to
 // walk to its trunk, play the native chopping loop, and leave a real GLB pile.
 for(const [kind,workerIndex,treeIndex] of [['witch',1,0],['orc',1,5]]){
   await evaluate("window.__fightersQA.reset();window.__fightersQA.enableOrcAI(false);"+
     "window.__fightersQA.setFaction('"+kind+"')");
   if(kind==='orc')await evaluate('window.__fightersQA.centerCamera(15,18)');
   await evaluate("window.__fightersQA.selectUnit('"+kind+"',"+workerIndex+")");
   const point=await evaluate('window.__fightersQA.treeScreenPoint('+treeIndex+')');
   check(point&&Number.isFinite(point.x)&&Number.isFinite(point.y),
     'Tree cannot be selected at its visible 3D trunk');
   await evaluate('window.__fightersQA.tap('+point.x+','+point.y+')');
   s=await evaluate('window.__fightersQA.snapshot()');
   check(s.forestry.workers.some(w=>w.clan===kind&&w.index===treeIndex),
     'Tapping the tree must order the '+kind+' worker to chop, not to mine or attack');
   const chop=await evaluate("(()=>{let swinging=false;for(let i=0;i<320;i++){"+
     "window.__fightersQA.advance(.25);const s=window.__fightersQA.snapshot();"+
     "const w=s."+(kind==='witch'?'witches':'orcs')+"["+workerIndex+"];"+
     "if(w?.animation==='TreeChopping_Loop'&&"+
     (kind==='witch'?"w.chopToolVisible&&!w.workToolVisible":
       "w.workToolVisible&&!w.chopToolVisible")+"&&!w.hammerToolVisible)swinging=true;"+
     "if(s.forest.felled)return {swinging,forest:s.forest};"+
     "}return {swinging,forest:window.__fightersQA.snapshot().forest};})()");
   check(chop.swinging&&chop.forest.felled===1&&chop.forest.instances===54&&
     chop.forest.obstacleCount===54&&chop.forest.logBundles===1&&
     chop.forest.trees[treeIndex].felled,
     'Felling must use a visible axe, remove exactly one tree obstacle and leave GLB logs: '+
     JSON.stringify(chop));
   const delivery=await evaluate("(()=>{let carried=false;for(let i=0;i<260;i++){"+
     "window.__fightersQA.advance(.25);const s=window.__fightersQA.snapshot();"+
     "carried ||= s.forestry.haulers.some(h=>h.clan==='"+kind+"'&&h.carrying);"+
     "if(s.wood."+kind+">"+(kind==='witch'?250:350)+")return {carried,s};"+
     "}return {carried,s:window.__fightersQA.snapshot()};})()");
   check(delivery.carried&&delivery.s.wood[kind]===(kind==='witch'?330:430)&&
     delivery.s.forestry.piles.length===0&&delivery.s.forest.logBundles===0&&
     delivery.s.forestry.haulers.length===0,
     'Only physically delivered wood may be credited to the correct clan: '+
     JSON.stringify({wood:delivery.s.wood,forestry:delivery.s.forestry}));
   s=await evaluate('window.__fightersQA.snapshot()');
   check(s.buildings.every(b=>b.id!=='tree-'+treeIndex),
     'Forest trees are terrain resources, not attackable buildings');
   await evaluate('window.__fightersQA.reset()');
   s=await evaluate('window.__fightersQA.snapshot()');
   check(s.forest.instances===55&&s.forest.felled===0&&
     s.forest.obstacleCount===55&&s.forest.logBundles===0,
     'Reset must restore every tree and release all log bundle scene nodes');
 }
 console.log('PASS FORESTRY: both clans axe-fell actual CC0 trees to tiny CC0 log bundles; reset clears them.');
 const noWoodSite=await evaluate("(()=>{for(let z=-12;z>=-17;z-=2)"+
   "for(let x=-8;x>=-16;x-=2)if(window.__fightersQA.canBuild(x,z,'witch-house'))"+
   "return {x,z};return null})()");
 check(noWoodSite,'Need a legal house site for the wood-cost regression');
 await evaluate("window.__fightersQA.setWood('witch',0)");
 check(!await evaluate('window.__fightersQA.orderBuild("witch-house",'+
   noWoodSite.x+','+noWoodSite.z+')')&&
   (await evaluate('window.__fightersQA.snapshot()')).construction.length===0,
   'A house cannot be ordered with gold but no wood');
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');

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
 check(warcraftHud.panel.left<=1&&warcraftHud.panel.width<=235&&
   warcraftHud.panel.top>=30&&warcraftHud.panel.height>450&&
   warcraftHud.minimap.width>=110&&warcraftHud.minimap.height>=110&&
   warcraftHud.top.height<=42&&warcraftHud.buttons.every(b=>b.width<=78&&b.height<=70),
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
 // Warcraft II has one contextual command grid, not global select-army/home
 // shortcuts. Building production icons are available without an extra menu.
 check(await evaluate("document.querySelector('#quick-commands,#quick-home,#quick-army,#quick-attack,#quick-stop,#quick-cancel,.command-page-next')===null"),
   'Warcraft II HUD must not expose invented global shortcuts or extra pages');
 check(await evaluate("![...document.querySelectorAll('#command-buttons button')].some(b=>/Toutes les unités|Construire/.test(b.querySelector('.action-name')?.textContent))"),
   'A production building must not offer army shortcuts or worker construction');
 await evaluate("window.__stableTrain=document.querySelector('#command-buttons button')");
 const steady=await evaluate('window.__fightersQA.snapshot()');
 await evaluate('window.__fightersQA.advance(70)');
 const postSteady=await evaluate('window.__fightersQA.snapshot()');
 check(postSteady.ui.commandRebuilds-steady.ui.commandRebuilds<=1,
   'HUD rebuilt during idle match: '+JSON.stringify([steady.ui,postSteady.ui]));
 check(await evaluate("window.__stableTrain===document.querySelector('#command-buttons button')"),
   'Contextual command button DOM identity was not preserved');


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
 const orcOwned=await evaluate("window.__fightersQA.fogAt(22,21,'orc')");
 check(hidden.explored===0&&hidden.visible===0&&orcOwned.visible>.2,
   'Enemy exploration must never leak into the witch map');
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
 const remembered=await evaluate('window.__fightersQA.fogAt(-15,-18)');
 const homeSight=await evaluate("window.__fightersQA.fogAt(-23.5,-17.5,'witch')");
 check(remembered.explored>0&&remembered.visible===0,
   'Exploration memory must persist even after scouts leave their old positions');
 check(homeSight.visible>.2,
   'The witch house must provide vision after every witch walks away');
 const fogRendering=await evaluate('window.__fightersQA.snapshot().fog');
 check(fogRendering.exploredBrightness===1,
   'Explored terrain must stay fully visible, not darken again: '+JSON.stringify(fogRendering));
 await screenshot('rts-fog-explored');
 // Once revealed, an enemy currently standing in an explored square remains
 // rendered and targetable after every scout has left the square.
 check((await evaluate('window.__fightersQA.snapshot().orcs[0].visible'))===false,
   'Enemy starting inside never-discovered black terrain must be hidden');
 await evaluate("window.__fightersQA.moveUnitTo('orc',0,-8,-8)");
 check((await evaluate('window.__fightersQA.snapshot().orcs[0].visible'))===true,
   'Enemy must appear when it enters discovered terrain');
 await evaluate("window.__fightersQA.moveUnitTo('witch',0,-18,-13);window.__fightersQA.moveUnitTo('witch',1,-16.5,-15);window.__fightersQA.moveUnitTo('witch',2,-19,-16)");
 const rememberedEnemy=await evaluate("({tile:window.__fightersQA.fogAt(-8,-8),enemy:window.__fightersQA.snapshot().orcs[0]})");
 check(rememberedEnemy.tile.explored>.2&&rememberedEnemy.tile.visible===0&&
   rememberedEnemy.enemy.visible===true,
   'Enemy in remembered territory must stay visible after scouts leave: '+
     JSON.stringify(rememberedEnemy));
 await evaluate('window.__fightersQA.reset()');
 check((await evaluate('window.__fightersQA.fogAt(-8,-8)')).explored===0,
   'Reset must discard exploration from the prior match');
 console.log('PASS FOG OF WAR: faction-isolated exploration, building sight, walking, memory, compact buffers, reset.');

 // Orcs must physically explore before they know where the witch house is.
 await evaluate("window.__fightersQA.enableOrcAI(true);window.__fightersQA.advance(11)");
 const scoutState=await evaluate('window.__fightersQA.snapshot()');
 check(!scoutState.fog.enemyBaseKnownToOrcs&&
   scoutState.orcAI.decisions.some(a=>a.type==='scout')&&
   !scoutState.orcAI.decisions.some(a=>a.type==='raid')&&
   scoutState.orcs.some(u=>u.scouting&&u.destination),
   'Orcs must send a scouting fighter instead of raiding a magically known house: '+
     JSON.stringify({ai:scoutState.orcAI,orcs:scoutState.orcs,fog:scoutState.fog}));
 const houseApproach=await evaluate("[-16,-18,-15,-19,-17,-21].reduce((a,_,i,all)=>"+
   "i%2===0&&window.__fightersQA.isClear(all[i],all[i+1])&&!a?"+
     "{x:all[i],z:all[i+1]}:a,null)");
 check(houseApproach,'No valid approach to the witch house for visibility regression');
 await evaluate("window.__fightersQA.moveUnitTo('orc',0,"+
   houseApproach.x+","+houseApproach.z+")");
 check((await evaluate('window.__fightersQA.snapshot()')).fog.enemyBaseKnownToOrcs,
   'Orc headquarters knowledge must unlock only upon physical scout sight');
 await evaluate('window.__fightersQA.enableOrcAI(false);window.__fightersQA.reset()');
 console.log('PASS ORC SCOUTING: no omniscient raid, scout waypoint, house discovery by sight.');

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
 const deposits=s.buildings.filter(b=>b.type==='mine');
 check(s.buildings.filter(b=>b.clanId==='orcs').length===4&&
  deposits.length===2&&deposits.every(b=>b.clanId==='neutral'&&
    !b.destructible&&!b.destroyed&&b.healthbarParent===null&&b.queue.length===0),
  'Both natural deposits must be neutral, permanent resources outside clan infrastructure');
 check(s.buildings.every(b=>b.hitbox.maxX>b.hitbox.minX&&b.hitbox.maxZ>b.hitbox.minZ),
  'Every orc structure must have a real 3D collider');
 check(s.buildings.every(b=>b.hitbox.maxX-b.hitbox.minX<5&&
   b.hitbox.maxZ-b.hitbox.minZ<5&&b.hitbox.maxY>1),
  'Orc models must fit the village and have a visible above-ground body (no microscopic cauldron or enormous footprint): '+
   JSON.stringify(s.buildings.map(b=>({id:b.id,extent:[b.hitbox.maxX-b.hitbox.minX,
     b.hitbox.maxY,b.hitbox.maxZ-b.hitbox.minZ]}))));
 check(s.buildings.filter(b=>b.type!=='mine').every(b=>b.healthbarParent==='scene'),
   'Orc HP bars must not inherit a building rotation/scale');
 check(s.buildings.filter(b=>b.type!=='mine').every(b=>b.healthbarPosition[1]>b.hitbox.maxY),
   'Orc HP bars must be above building top');
 // Enemy HP must drain from the right. Its left edge must never move,
 // and a damaged building in the enemy's unseen territory cannot leak intel.
 const hpBuilding=s.buildings.find(b=>b.type==='hut');
 await evaluate("window.__fightersQA.setBuildingHealth("+
   JSON.stringify(hpBuilding.id)+","+hpBuilding.maxHealth/2+")");
 const damagedBar=(await evaluate('window.__fightersQA.snapshot()')).buildings.find(
   b=>b.id===hpBuilding.id);
 check(Math.abs(damagedBar.healthbarFillScale-.5)<.001&&
   Math.abs(damagedBar.healthbarFillOffset+.55)<.001&&
   Math.abs(damagedBar.healthbarFillOffset-1.1*damagedBar.healthbarFillScale+1.1)<.001,
   'Enemy HP fill must stay pinned to the left edge at half health: '+JSON.stringify(damagedBar));
 check(!damagedBar.healthbarVisible,
   'Enemy damaged HP bar must stay hidden outside discovered witch territory');
 await evaluate("window.__fightersQA.setBuildingHealth("+
   JSON.stringify(hpBuilding.id)+","+hpBuilding.maxHealth+")");

 // Direct damage, synthetic HP updates and upgrade orders cannot change a deposit.
 const mineBefore=s.buildings.find(b=>b.id==='neutral-gold-mine-01');
 await evaluate("window.__fightersQA.damageBuilding('neutral-gold-mine-01',999999);"+
   "window.__fightersQA.setBuildingHealth('neutral-gold-mine-01',1)");
 const mineAfter=(await evaluate('window.__fightersQA.snapshot()')).buildings.find(b=>b.id==='neutral-gold-mine-01');
 check(mineAfter&&!mineAfter.destroyed&&mineAfter.health===mineBefore.health&&
   !await evaluate("window.__fightersQA.attackBuilding('neutral-gold-mine-01')")&&
   !await evaluate("window.__fightersQA.upgradeBuilding('neutral-gold-mine-01')")&&
   !await evaluate("window.__fightersQA.upgradeBuilding('neutral-gold-mine')"),
   'Neutral gold deposits must never be damaged, upgraded or attacked');
 await evaluate("window.__fightersQA.selectBuildingById('neutral-gold-mine-01')");
 check(await evaluate("document.querySelector('#command-info').textContent.includes('indestructible')&&"+
   "!document.querySelector('#command-health').textContent.includes('PV')&&"+
   "!Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Améliorer'))"),
   'Natural deposit HUD must describe a neutral resource without health or upgrades');
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

 // Original worker commands: distinct Basic and Advanced Build submenus.
 // Production buildings show unit icons directly; never a construction action.
 check(!await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent?.startsWith('Construire'))"),
   'Orc barracks must not construct buildings (worker-only action)');
 await evaluate("window.__fightersQA.selectUnit('orc',1)");
 check(await evaluate("['Bât. base','Bât. avancé'].every(n=>Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent===n))"),
   'Orc worker needs distinct Warcraft II Basic/Advanced build commands');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Bât. base')?.click()");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Hutte'))"),
   'Basic Build submenu did not open');
 check(!await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Mine'))"),
   'Construction palette must not offer mine deposits');
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent==='Retour')"),
   'Warcraft II Build submenu needs its Back command');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Retour')?.click()");
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Bât. avancé')?.click()");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Chaudron')||b.textContent.includes('Usine'))"),
   'Advanced Build submenu did not open');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Retour')?.click();window.__fightersQA.selectOrcBarrack()");

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
   mobile.panel.height<=180&&mobile.panel.top>=mobile.height-182,
  'Mobile command panel must be a compact strip, not a huge sheet: '+
  JSON.stringify(mobile.panel));
 const mobileMini=await evaluate("(()=>{const m=document.querySelector('#war2-minimap').getBoundingClientRect(),buttons=[...document.querySelectorAll('#command-buttons button:not([hidden])')].map(b=>b.getBoundingClientRect().toJSON());return {map:m.toJSON(),buttons}})()");
 check(mobileMini.map.width>=40&&mobileMini.map.height>=40&&
   mobileMini.buttons.length<=6&&mobileMini.buttons.every(b=>b.width>=56&&b.height>=44&&
     b.left>=0&&b.right<=mobile.width),
   'Mobile minimap or icon grid overflowed: '+JSON.stringify(mobileMini));
 // War II original: only context commands, direct training icons on a
 // building, worker construction submenu and no invented army shortcuts.
 const mobileUsability=await evaluate("(()=>{const p=document.querySelector('#command-panel'),t=document.querySelector('#command-title'),i=document.querySelector('.command-identity'),g=document.querySelector('#command-buttons'),q=document.querySelector('#training-progress'),b=[...g.querySelectorAll('button:not([hidden])')];const title=getComputedStyle(t);return {name:t.textContent,font:parseFloat(title.fontSize),nameVisible:t.scrollWidth<=t.clientWidth+1,identity:i.getBoundingClientRect().toJSON(),commands:b.map(x=>x.getBoundingClientRect().toJSON()),labels:b.map(x=>({name:x.querySelector('.action-name')?.textContent,visible:getComputedStyle(x.querySelector('.action-name')).display})),queueVisible:getComputedStyle(q).display!=='none',hasNext:!!g.querySelector('.command-page-next'),hasShortcuts:!!document.querySelector('#quick-commands'),panel:p.getBoundingClientRect().toJSON()}})()");
 check(mobileUsability.font>=12&&mobileUsability.nameVisible&&
   mobileUsability.commands.length>=3&&mobileUsability.commands.length<=6&&
   !mobileUsability.hasNext&&!mobileUsability.hasShortcuts&&
   mobileUsability.labels.every(x=>x.visible!=='none')&&
   mobileUsability.commands.every(x=>x.top>=mobileUsability.identity.bottom&&
     x.bottom<=mobileUsability.panel.bottom-6&&x.height>=44)&&
   !mobileUsability.queueVisible,
   'Mobile HUD must preserve readable contextual Warcraft II commands only: '+
   JSON.stringify(mobileUsability));
 check(mobileUsability.labels.some(x=>x.name==='Ouvrière')&&
   mobileUsability.labels.some(x=>x.name==='Garde'),
   'Witch house must expose training icons directly');
 console.log('PASS WARCRAFT II MOBILE HUD: 44px direct train icons and no invented shortcut row.');
 check(mobile.pause.width>0,'Compact pause button missing');
 await screenshot('rts-mobile-command-panel');
 await evaluate("window.__fightersQA.selectUnit('witch',1)");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent==='Construire')"),
   'Witch worker needs its contextual Build icon');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Construire')?.click()");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent==='Maison')"),
   'Witch Build submenu must expose construction type');
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent==='Retour')"),
   'Build submenu must expose a Back command');
 await screenshot('rts-mobile-worker-build-submenu');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Retour')?.click();window.__fightersQA.selectHouse()");

 const framing=await evaluate("(()=>{const hero=document.querySelector('.hero-hud').getBoundingClientRect();const score=document.querySelector('.score').getBoundingClientRect();const pause=document.querySelector('#pause').getBoundingClientRect();return {hero:{right:hero.right,bottom:hero.bottom},score:{left:score.left,right:score.right},pause:{left:pause.left,right:pause.right}}})()");
 check(framing.hero.right<=framing.score.left+3&&framing.score.right<=framing.pause.left+4&&
  framing.pause.right<=mobile.width+1,'Compact mobile HUD overlaps: '+JSON.stringify(framing));
 const resourceBadges=await evaluate("Array.from(document.querySelectorAll('.score>div'),d=>({icon:getComputedStyle(d.querySelector('small'),'::before').content,border:getComputedStyle(d).borderColor}))");
 check(resourceBadges.length===4&&resourceBadges.every((item,i)=>
   item.icon.includes(['💰','🪵','🌾','⚔'][i]))&&
   new Set(resourceBadges.map(v=>v.icon)).size===4,
   'Mobile resource counters need four distinct resource pictograms: '+
   JSON.stringify(resourceBadges));
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
 const mobileForest=await evaluate('window.__fightersQA.snapshot().forest');
 check(mobileForest.visibleInViewport>=3,
   'Portrait-phone camera must display at least three revealed trees: '+JSON.stringify(mobileForest));
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
 check(!await evaluate("window.__fightersQA.attackBuilding('neutral-gold-mine')")&&
  !await evaluate("window.__fightersQA.attackBuilding('neutral-gold-mine-01')"),
  'Neither neutral deposit may become a hostile combat target');
 check(await evaluate("window.__fightersQA.orderMine('witch',1,'neutral-gold-mine-01')")&&
  await evaluate("window.__fightersQA.orderMine('orc',1,'neutral-gold-mine')"),
  'Both clans must be able to mine either neutral deposit');
 await evaluate("window.__fightersQA.orderMine('orc',1,'neutral-gold-mine-01')");
 const witchGoldBefore=s.gold.witch;
 check(await evaluate("window.__fightersQA.orderMine('witch',1,'neutral-gold-mine')"),
  'Witch worker could not take a mine job');
  const miningSwing=await evaluate("(()=>{const seen={witch:false,orc:false};"+
    "for(let i=0;i<38;i++){window.__fightersQA.advance(1);const s=window.__fightersQA.snapshot();"+
    "for(const kind of ['witch','orc'])if(s[kind==='witch'?'witches':'orcs'].some(u=>"+
    "u.role==='worker'&&u.animation==='Work_Swing'&&u.workToolVisible&&"+
    "!u.hammerToolVisible))seen[kind]=true;}return seen})()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.gold.witch>witchGoldBefore&&s.mining.totalMinedGold>0,
  'Witch worker never mined physical gold: '+JSON.stringify(s.mining));
  check(miningSwing.witch&&miningSwing.orc,
    'Workers of both clans must swing visible scythes/axes when mining: '+JSON.stringify(miningSwing));
 check(s.mining.workers.every(u=>u.role==='worker'),
  'Non-worker character was assigned mining');
 // A construction order debits once, sends the worker to the real X/Z
 // perimeter and creates the structure only after its work animation.
 const site=await evaluate("(()=>{for(let z=-12;z>=-17;z-=2)for(let x=-8;x>=-16;x-=2)if(window.__fightersQA.canBuild(x,z,'witch-house'))return {x,z};return null})()");
 check(site,'No safe witch house construction site');
 const buildingsBefore=s.buildings.length,goldBeforeBuild=s.gold.witch,
  woodBeforeBuild=s.wood.witch;
 check(await evaluate('window.__fightersQA.orderBuild("witch-house",'+site.x+','+site.z+')'),
  'Witch worker could not start a construction job');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===buildingsBefore&&s.construction.length===1&&
  s.gold.witch===goldBeforeBuild-230&&s.wood.witch===woodBeforeBuild-75,
  'Construction must reserve both gold and wood and wait for worker');
  const constructionSwing=await evaluate("(()=>{let seen=false;for(let i=0;i<38;i++){"+
    "window.__fightersQA.advance(1);seen ||= window.__fightersQA.snapshot().witches.some(u=>"+
    "u.role==='worker'&&u.animation==='Work_Swing'&&u.hammerToolVisible&&"+
    "!u.workToolVisible);}return seen})()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.construction.length===0&&s.buildings.length===buildingsBefore+1&&
  s.buildings.some(b=>b.type==='witch-house'&&b.clanId==='witch'),
  'Witch worker did not finish a real house: '+JSON.stringify(s.construction));
  check(constructionSwing,'House construction must show a hammer, never a scythe');
 console.log('PASS ECONOMIC ROLES: witch mined gold, constructed a shared-model house; soldiers cannot mine, workers cannot fight.');
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===6,'Reset must remove the additional witch house');
 check(await evaluate('window.__fightersQA.isClear(8,-10)'),
  'Reset must remove constructed building hitboxes');

 // A real CC0 menhir circle is constructed by a witch worker. Its six stones
 // block only their own small footprints, leaving the glowing middle walkable.
 await until('window.__fightersQA.snapshot().healing.modelLoaded',
   'bundled CC0 standing-stone model',30000);
 const stoneSite=await evaluate("(()=>{for(let z=-11;z>=-25;z-=1)"+
   "for(let x=-8;x>=-24;x-=1)if(window.__fightersQA.canBuild(x,z,'stone-circle'))"+
   "return {x,z};return null})()");
 check(stoneSite,'No buildable spot for the witch healing circle');
 check(await evaluate('window.__fightersQA.orderBuild("stone-circle",'+
   stoneSite.x+','+stoneSite.z+')'),'Witch worker could not start a healing circle');
 const stoneBuilt=await evaluate("(()=>{for(let i=0;i<45;i++){"+
   "window.__fightersQA.advance(1);if(window.__fightersQA.snapshot().healing.circles.length)"+
   "return true;}return false})()");
 check(stoneBuilt,'Witch worker did not finish the stone circle');
 s=await evaluate('window.__fightersQA.snapshot()');
 const sanctuary=s.healing.circles[0];
 check(sanctuary.stones===6&&sanctuary.navigableCenter&&
   s.buildings.some(b=>b.id===sanctuary.id&&b.health===280),
   'Six actual menhirs must surround a walkable magic center: '+JSON.stringify(sanctuary));
 await evaluate('window.__fightersQA.centerCamera('+sanctuary.x+','+sanctuary.z+')');
 await screenshot('rts-stone-healing-circle');
 await evaluate('window.__fightersQA.selectBuildingById('+JSON.stringify(sanctuary.id)+')');
 check(await evaluate('document.querySelector("#command-title").textContent')==='Cercle de roches',
   'The sanctuary must be selectable with its own French HUD label');
 await evaluate('window.__fightersQA.setUnitHealth("witch",0,24);window.__fightersQA.advance(1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches[0].healingTarget===sanctuary.id,
   'A wounded idle witch should seek shelter while no enemy is nearby');
 const recovered=await evaluate("(()=>{let witch=null;for(let i=0;i<35;i++){"+
   "window.__fightersQA.advance(1);witch=window.__fightersQA.snapshot().witches[0];"+
   "if(witch.health>=82)break;}return witch})()");
 check(recovered.health>=82&&
   Math.hypot(recovered.x-sanctuary.x,recovered.z-sanctuary.z)<1.5,
   'Wounded witch must reach the circle and regain life: '+JSON.stringify(recovered));
 await evaluate('window.__fightersQA.passive("witch");'+
   'window.__fightersQA.setUnitHealth("orc",0,30);'+
   'window.__fightersQA.moveUnitTo("orc",0,'+sanctuary.x+','+sanctuary.z+');'+
   'window.__fightersQA.advance(2)');
 check((await evaluate('window.__fightersQA.snapshot().orcs[0].health'))===30,
   'The circle must never heal orcs');
 await evaluate('window.__fightersQA.passive(null)');
 await evaluate('window.__fightersQA.damageBuilding('+JSON.stringify(sanctuary.id)+',500)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.healing.circles.length===0&&s.buildings.every(b=>b.id!==sanctuary.id),
   'Destroyed circles must be removed along with their menhir obstacles');
 await evaluate('window.__fightersQA.reset()');
 check((await evaluate('window.__fightersQA.snapshot()')).healing.circles.length===0,
   'Reset must not keep stone circles or their healing jobs');
 console.log('PASS STONE HEALING: actual menhirs, construction, walkable center, AI retreat, healing, destruction and reset.');

 // The wheat-only CC BY model has three distinct growth stages. Stage 3 stays ripe
 // until a physical witch worker harvests, then the crop begins again at 1.
 const gardenSite=await evaluate("(()=>{for(let z=-9;z>=-23;z-=2)for(let x=-8;x>=-24;x-=2)"+
   "if(window.__fightersQA.canBuild(x,z,'garden'))return {x,z};return null})()");
 check(gardenSite,'No buildable garden site on witch territory');
 check(await evaluate('window.__fightersQA.orderBuild("garden",'+gardenSite.x+','+gardenSite.z+')'),
   'Witch worker could not begin garden construction');
 const gardenBuild=await evaluate("(()=>{let planting=false,inside=false,built=false;"+
   "for(let i=0;i<160;i++){window.__fightersQA.advance(.25);const s=window.__fightersQA.snapshot();"+
   "const w=s.witches.find(u=>u.role==='worker');"+
   "if(w?.animation==='Farm_PlantSeed'&&!w.workToolVisible&&!w.hammerToolVisible){"+
   "planting=true;inside ||= Math.abs(w.x-("+gardenSite.x+"))<.75&&Math.abs(w.z-("+gardenSite.z+"))<.75;}"+
   "if(s.buildings.some(b=>b.type==='garden')){built=true;break;}}"+
   "return {planting,inside,built};})()");
 check(gardenBuild.planting&&gardenBuild.inside&&gardenBuild.built,
   'Gardener must enter the plot and sow by hand without a hammer: '+JSON.stringify(gardenBuild));
 await until("window.__fightersQA.snapshot().crops.loaded",
   'real licensed crop GLB after first garden',30000);
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.crops.transport==='gzip'&&s.crops.wireBytes>0,
   'Garden asset should use the precompressed GLB transfer');
 check(s.crops.templates===6&&s.crops.plots.length===6&&
   s.crops.plots.every(p=>p.real&&p.visible===1&&p.model==='Wheat_F1'),
   'All six beds must use the real three-stage GLB variants: '+JSON.stringify(s.crops));
 const gardenId=s.buildings.find(b=>b.type==='garden')?.id;
 check(gardenId&&s.farming.gardens.length===1&&
   s.farming.gardens[0].stages.every(stage=>stage===1)&&
   s.farming.gardens[0].species.every(species=>species==='wheat'),
   'Garden must start with only wheat at stage 1');
 await evaluate('window.__fightersQA.advance(12)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.farming.gardens[0].stages.every(stage=>stage===2),'Crops must visibly reach stage 2');
 check(s.crops.plots.every(p=>p.real&&p.visible===1&&p.model==='Wheat_F2'),
   'All plots must display their stage-2 GLB mesh, not a scaled placeholder');
 await evaluate('window.__fightersQA.advance(12)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.farming.gardens[0].stages.every(stage=>stage===3),
   'Crops must reach the third and final harvestable stage');
 check(s.crops.plots.every(p=>p.real&&p.visible===1&&p.model==='Wheat_F3'),
   'Mature crops must display the exact stage-3 GLB mesh');
 // The worker can be explicitly assigned; the auto-harvester also works when idle.
 // Unlike mining and building, wheat is picked by hand using the authored
 // Quaternius Farm_Harvest clip, with the work tool hidden.
 check(await evaluate('window.__fightersQA.orderHarvest(1,'+JSON.stringify(gardenId)+')'),
   'Witch worker could not be assigned to garden');
  const harvestGesture=await evaluate("(()=>{let seen=false,inside=false;for(let i=0;i<26;i++){"+
    "window.__fightersQA.advance(1);const s=window.__fightersQA.snapshot();"+
    "for(const u of s.witches)if(u.role==='worker'&&u.animation==='Farm_Harvest'&&"+
    "!u.workToolVisible&&!u.hammerToolVisible){seen=true;inside ||= " +
    "Math.abs(u.x-("+gardenSite.x+"))<1.2&&Math.abs(u.z-("+gardenSite.z+"))<1.6;}"+
    "}return {seen,inside};})()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.farming.harvests>0&&s.farming.producedFood>=8,
   'Worker never reached and harvested mature crops: '+JSON.stringify(s.farming));
  check(harvestGesture.seen&&harvestGesture.inside,
    'Witch must enter the garden and pick by hand with no tool: '+JSON.stringify(harvestGesture));
 check(s.farming.gardens[0].stages.every(stage=>stage>=1&&stage<=3),
   'Garden must never show dead or fourth-stage crops');
 console.log('PASS GARDEN: plant inside, three real wheat stages, harvest inside by hand.');
 await evaluate('window.__fightersQA.reset();window.__fightersQA.setFood(0)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const healthBeforeStarvation=s.witches.map(w=>w.health);
 await evaluate('window.__fightersQA.advance(2)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.farming.food===0&&s.witches.every((w,i)=>w.health<healthBeforeStarvation[i]),
   'All witches must lose HP when no food remains');
 check(s.buildings.every(b=>b.type!=='garden')&&s.farming.gardens.length===0,
   'Reset must clear all gardens and worker assignments');
 await evaluate('window.__fightersQA.reset()');
 const restoredFood=(await evaluate('window.__fightersQA.snapshot()')).farming.food;
 check(restoredFood>44.9&&restoredFood<=45,
   'New match must restore starting food, allowing one live animation frame: '+restoredFood);
 console.log('PASS FAMINE: starvation damages witches and reset removes garden economy.');


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

 // Regression: repeated Orc approaches must not grow the shared building
 // perimeter cache. The old unshift mutated it on every recalculation.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.passive('witch');"+
   "window.__fightersQA.setFaction('orc');"+
   "window.__fightersQA.moveUnitTo('orc',2,-18.2,-17.5);"+
   "window.__fightersQA.selectUnit('orc',2)");
 const approachAudit=await evaluate(
   "window.__fightersQA.auditBuildingApproach('orc',2,'witch-house-01',12)");
 check(approachAudit.before>0&&approachAudit.available>0&&
   approachAudit.after===approachAudit.before,
   'HQ perimeter cache grows during repeated Orc approaches: '+
     JSON.stringify(approachAudit));
 const blockedSiege=await evaluate(
   "window.__fightersQA.auditUnreachableSiege('orc',2,'witch-house-01')");
 check(blockedSiege.approachPlans<=50&&blockedSiege.routePlans<=4,
   'Unreachable HQ order causes unbounded per-frame A* replanning: '+
     JSON.stringify(blockedSiege));
 console.log('PASS UNREACHABLE HQ ROUTE BUDGET:',JSON.stringify(blockedSiege));
 const rangedHouseHp=(await evaluate('window.__fightersQA.snapshot()')).house.health;
 check(await evaluate("window.__fightersQA.attackBuilding('witch-house-01')"),
   'Ranged Orc could not target the mother house');
 await evaluate('window.__fightersQA.advance(8)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.house.health<rangedHouseHp&&s.running&&
   s.assets.sharedProjectiles<=25&&s.assets.activeProjectiles<=1,
   'Ranged Orc HQ attack stalled, failed damage, or retained projectiles: '+
     JSON.stringify({house:s.house.health,projectiles:s.assets}));
 console.log('PASS RANGED HQ SIEGE:',JSON.stringify(approachAudit));
 // Real multi-Orc siege: simulate the whole battle with several ranged troops,
 // and reject CPU stalls, not just wrong health or missing projectiles.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.passive('witch');"+
   "window.__fightersQA.setFaction('orc')");
 const siegeCount=await evaluate('window.__fightersQA.spawnOrcSiege()');
 check(siegeCount>=6,'Could not stage the ranged Orc siege: '+siegeCount);
 const siegeStarted=Date.now();
 await evaluate('window.__fightersQA.advance(12)');
 const siegeCpuMs=Date.now()-siegeStarted;
 s=await evaluate('window.__fightersQA.snapshot()');
 check(siegeCpuMs<14000&&s.house.health<500&&
   s.assets.sharedProjectiles<=24+siegeCount,
   'Multi-Orc HQ attack caused CPU stall or missed damage: '+
     JSON.stringify({siegeCount,siegeCpuMs,house:s.house.health,projectiles:s.assets}));
 console.log('PASS MULTI-ORC HQ CPU SOAK:',JSON.stringify({
   siegeCount,siegeCpuMs,house:s.house.health,projectiles:s.assets.sharedProjectiles}));

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
 check(s.buildings.filter(b=>!b.destroyed&&b.type!=='mine')
  .every(b=>b.healthbarParent==='scene'),
  'Autonomously built HP bars inherited building transforms');
 await screenshot('rts-orc-autonomous-village');
 // Victory requires destroying only clan buildings. Both neutral deposits
 // must survive the end of the match and remain navigational obstacles.
 const orcStructures=s.buildings.filter(b=>b.clanId==='orcs').map(b=>b.id);
 for(const id of orcStructures)
  await evaluate("window.__fightersQA.damageBuilding("+JSON.stringify(id)+",999999)");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(!s.running&&s.buildings.filter(b=>b.type==='mine').length===2&&
  s.buildings.filter(b=>b.type==='mine').every(b=>!b.destroyed&&b.clanId==='neutral'),
  'Victory must ignore neutral gold deposits while keeping them intact');

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

 // Opt-in only: prevent 270 simulated seconds from running (and billing)
 // on every normal pull request. Run locally with FIGHTERS_LONG_PLAY=1.
 if(process.env.FIGHTERS_LONG_PLAY==='1'){
 // Real-match soak: training, a large moving army, physical mining,
 // autonomous scouting/construction and live WebGL rendering all stay active.
 // Repeated GC checkpoints distinguish retained JS heap from expected
 // temporary allocations and raw game-tick CPU growth.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.enableOrcAI(true);"+
   "window.__fightersQA.selectHouse();"+
   "window.__fightersQA.trainRole('witch','worker');"+
   "window.__fightersQA.trainRole('witch','melee');"+
   "window.__fightersQA.trainRole('witch','ranged')");
 await evaluate('window.__fightersQA.advance(22)');
 const armySize=await evaluate('window.__fightersQA.spawnWitches(20)');
 check(armySize===20,'Long-play test could not assemble twenty witches: '+armySize);
 await evaluate("(()=>{const points=[[-16,8],[-14,14],[-10,-12],[-5,8]];"+
   "const at=points.find(p=>window.__fightersQA.canBuild(p[0],p[1],'witch-house'));"+
   "if(at)window.__fightersQA.orderBuild('witch-house',at[0],at[1]);})()");
 await call('HeapProfiler.enable');
 const longPlay=[];
 for(const [index,goal] of [[-7,-13],[-13,3],[-6,13],[-12,-8]].entries()){
   if(await evaluate('window.__fightersQA.snapshot().running')){
     await evaluate("window.__fightersQA.selectWitches();window.__fightersQA.move("+
       goal.join(',')+")");
   }
   const start=Date.now();
   await evaluate('window.__fightersQA.advance(20)');
   const cpuMs=Date.now()-start;
   // Let the actual requestAnimationFrame/WebGL pipeline catch up after
   // fast-forwarding game time; the separate RAF render is not faked.
   await sleep(1250);
   await call('HeapProfiler.collectGarbage');
   const heap=await call('Runtime.getHeapUsage');
   const snap=await evaluate('window.__fightersQA.snapshot()');
   const sample={phase:index+1,elapsedGameSeconds:(index+1)*20+22,
     cpuMs,retainedHeapMiB:Math.round(heap.usedSize/1048576*100)/100,
     totalHeapMiB:Math.round(heap.totalSize/1048576*100)/100,
     witches:snap.witches.length,orcs:snap.orcs.length,
     buildings:snap.buildings.filter(b=>!b.destroyed).length,
     gold:snap.gold,explored:snap.fog.exploredCells,
     gpu:snap.gpu,aiMode:snap.orcAI.mode,running:snap.running};
   longPlay.push(sample);
   console.log('REAL_GAMEPLAY_SOAK',JSON.stringify(sample));
 }
 check(longPlay.some(p=>p.orcs>4)&&longPlay.some(p=>p.explored>0),
   'Long-play did not exercise enemy production and exploration');
 const tail=longPlay.slice(-2);
 const driftMiB=tail[1].retainedHeapMiB-tail[0].retainedHeapMiB;
 console.log('REAL_GAMEPLAY_SOAK_SUMMARY',JSON.stringify({
   gameSeconds:102,heapDriftMiBLast20Seconds:driftMiB,
   cpuMsPer20GameSeconds:longPlay.map(p=>p.cpuMs),
   gpu:longPlay.map(p=>p.gpu)
 }));
 await screenshot('rts-real-gameplay-soak');

 // More faithful human session: recruit over time THROUGH the actual HUD
 // buttons and send dozens of actual pointer clicks to ground points across
 // the map. This catches leaks in commands, rebuilding, animations and paths
 // that a one-shot unit spawn cannot exercise.
 await evaluate('window.__fightersQA.reset();window.__fightersQA.enableOrcAI(true)');
 const destinations=[[-21,-9],[-14,4],[-6,-3],[-19,15],[-3,15],[9,8],
   [-10,-15],[15,-10],[-4,21],[-23,3],[5,-18],[-9,18],
   [18,13],[-16,-19],[2,2],[-3,-24]];
 let trainingClicks=0,moveClicks=0;
 const humanSamples=[];
 for(let cycle=0;cycle<8;cycle++){
   await evaluate('window.__fightersQA.selectHouse()');
   for(let recruit=0;recruit<4;recruit++){
     const slot=[0,1,2,1][(cycle+recruit)%4];
     const queued=await evaluate("(()=>{const buttons=[...document.querySelectorAll('#command-buttons button')]"+
       ".filter(b=>b.title.startsWith('Former '));"+
       "const button=buttons["+slot+"];if(!button||button.disabled)return false;"+
       "button.click();return true})()");
     if(queued)trainingClicks++;
   }
   const cpuStart=Date.now();
   await evaluate('window.__fightersQA.advance(9)');
   for(let move=0;move<6;move++){
     if(!await evaluate('window.__fightersQA.snapshot().running'))break;
     const target=destinations[(cycle*6+move)%destinations.length];
     await evaluate('window.__fightersQA.selectWitches();'+
       'window.__fightersQA.centerCamera('+target.join(',')+')');
     const point=await evaluate('window.__fightersQA.groundScreenPoint('+
       target.join(',')+')');
     if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
     // Dispatch genuine browser mouse events through the same handlers as a
     // player's tap; this does NOT call the test-only move helper.
     await call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,
       button:'left',buttons:1,clickCount:1});
     await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,
       button:'left',buttons:0,clickCount:1});
     moveClicks++;
     await evaluate('window.__fightersQA.advance(2)');
   }
   const cpuMs=Date.now()-cpuStart;
   await sleep(900);
   await call('HeapProfiler.collectGarbage');
   const memory=await call('Runtime.getHeapUsage');
   const game=await evaluate('window.__fightersQA.snapshot()');
   const sample={cycle:cycle+1,gameSeconds:(cycle+1)*21,
     trainingClicks,moveClicks,cpuMs,
     heapMiB:Math.round(memory.usedSize/1048576*100)/100,
     witches:game.witches.length,orcs:game.orcs.length,
     buildingCount:game.buildings.filter(b=>!b.destroyed).length,
     gpu:game.gpu,running:game.running};
   humanSamples.push(sample);
   console.log('HUMAN_PLAY_RECRUIT_AND_CLICKS',JSON.stringify(sample));
   if(!game.running){
     // A victory/defeat is a real outcome; begin another match to exercise
     // resource disposal and memory across consecutive played sessions.
     await evaluate('window.__fightersQA.reset();window.__fightersQA.enableOrcAI(true)');
   }
 }
 check(trainingClicks>=10&&moveClicks>=30,
   'Long-play scenario did not actually recruit and click repeatedly: '+
   JSON.stringify({trainingClicks,moveClicks}));
 console.log('HUMAN_PLAY_SUMMARY',JSON.stringify({
   simulatedSeconds:168,trainingClicks,moveClicks,
   retainedHeap:humanSamples.map(p=>p.heapMiB),
   cpuMs:humanSamples.map(p=>p.cpuMs),
   gpuTextures:humanSamples.map(p=>p.gpu.textures)
 }));
 await screenshot('rts-human-play-recruit-and-move');

 }
 // Regression for actual GPU skeleton leaks. All actors must upload their
 // bone textures to real WebGL, including off-screen actors that Three.js
 // would normally skip until first rendered. Otherwise a camera-dependent
 // test would mistakenly see peak=restored despite spawning many witches.
 await evaluate("window.__fightersQA.enableOrcAI(false);window.__fightersQA.reset();"+
   "window.__fightersQA.centerCamera(-23.5,-17.5)");
 await sleep(350);
 const initialUpload=await evaluate('window.__fightersQA.prewarmSkeletonTextures()');
 const gpuBaseline=(await evaluate('window.__fightersQA.snapshot()')).gpu.textures;
 const skeletonBaseline=await evaluate('window.__fightersQA.skeletonResources()');
 const gpuLifecycles=[];
 for(let cycle=0;cycle<4;cycle++){
   check(await evaluate('window.__fightersQA.spawnWitches(20)')===20,
     'Cannot populate GPU skeleton-lifecycle test');
   const upload=await evaluate('window.__fightersQA.prewarmSkeletonTextures()');
   const peak=(await evaluate('window.__fightersQA.snapshot()')).gpu.textures;
   const peakSkeletons=await evaluate('window.__fightersQA.skeletonResources()');
   await evaluate('window.__fightersQA.reset();'+
     'window.__fightersQA.centerCamera(-23.5,-17.5)');
   await sleep(450);
   // Compare like for like: the seven reset actors can be outside the
   // camera frustum, so upload their skeleton textures before sampling.
   await evaluate('window.__fightersQA.prewarmSkeletonTextures()');
   const restored=(await evaluate('window.__fightersQA.snapshot()')).gpu.textures;
   const restoredSkeletons=await evaluate('window.__fightersQA.skeletonResources()');
   gpuLifecycles.push({upload,peak,restored,peakSkeletons,restoredSkeletons});
   console.log('GPU_BONE_TEXTURE_CYCLE',JSON.stringify({
     baseline:gpuBaseline,initialUpload,skeletonBaseline,cycle:cycle+1,
     peak,restored,peakSkeletons,restoredSkeletons
   }));
   check(peakSkeletons.uniqueBoneTextures>=restoredSkeletons.uniqueBoneTextures+10&&
     peakSkeletons.uniqueBoneTextures===peakSkeletons.boneTextures,
     'Newly rendered witches did not own independent bone textures: '+
       JSON.stringify({skeletonBaseline,gpuLifecycles}));
   check(peak>=restored+10,
     'GPU did not release the rendered actors\' bone textures after reset: '+
       JSON.stringify({baseline:gpuBaseline,gpuLifecycles}));
   // The first TWO cycles can initialize previously unseen scene/material
   // textures asynchronously (unrelated to the per-actor bone textures).
   // A true per-unit leak keeps increasing over the subsequent cycles.
   if(cycle>1)check(restored<=gpuLifecycles[cycle-1].restored+2,
     'GPU texture count grows across repeated identical unit lifecycles: '+
       JSON.stringify({baseline:gpuBaseline,gpuLifecycles}));
 }
 console.log('GPU_BONE_TEXTURE_LIFECYCLE',JSON.stringify({
   baseline:gpuBaseline,gpuLifecycles
 }));

 await evaluate('window.__fightersQA.enableOrcAI(false);window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4&&
  s.buildings.filter(b=>!b.destroyed).length===6,'Reset after AI restores starting match');
 check(!errors.length,'Browser JavaScript exceptions: '+errors.join(' | '));
 console.log('PASS RTS: stable HUD, persistent shortcuts, blue/red reticles, two-tap attacks, one-finger pan, instant two-finger box selection, locked 3× zoom, destroyed buildings and strategic AI.');

}
try{await run();}finally{try{socket?.close();}catch{}chrome.kill();try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:350});}catch(error){console.warn('Chrome profile cleanup only:',error.message);}}
