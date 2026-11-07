import {runTouchQa} from './touch.mjs';
import {runResetQa} from './reset.mjs';

export async function runVisualQa({evaluate,call,check,until,screenshot,sleep,findWitchSite}){
 let s;
 const ravens=await evaluate('window.__fightersQA.snapshot().ravens');
 check(ravens.animated===2&&ravens.birds.length===2&&
   ravens.birds.every(b=>b.y>3.5),
   'Two real animated ravens must fly or perch above the ground: '+JSON.stringify(ravens));
 const forest=await evaluate('window.__fightersQA.snapshot().forest');
 check(forest.instances===91&&forest.obstacleCount===91&&forest.visibleInViewport>=3,
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
 await until("window.__fightersQA.sound().available.interaction>0&&window.__fightersQA.sound().available.attack>0",'Orc role voice catalog',10000);
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
 // Audio only changed selection and the viewed faction. Reuse that match for
 // raven scouting and the emergency defense tests before resetting the world.
 await evaluate("window.__fightersQA.setFaction('witch')");
 s=await evaluate('window.__fightersQA.snapshot()');
 await evaluate("window.__fightersQA.inspectEnemy('orc',0)");
 check((await evaluate('window.__fightersQA.snapshot()')).selectedEnemyId===s.orcs[0].id&&
   await evaluate("document.querySelector('#command-health .hp-fill')?.classList.contains('hp-enemy')")&&
   await evaluate("document.querySelector('#command-info').textContent.includes('ennemi')"),
   'Inspecting an enemy must show its role, description and red health meter');
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
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4,'Starting troops');
 check(s.house.maxHealth>=1400&&s.buildings.filter(b=>b.clanId==='orcs'&&b.type!=='mine')
   .every(b=>b.maxHealth>=400),'Clan buildings must survive sustained assaults');
 await evaluate('window.__fightersQA.enableWitchAI(true)');
 check(await evaluate("window.__fightersQA.strikeUnit('orc',0,'witch',1,5)"),
   'Could not simulate an assault on a witch worker');
 const struck=await evaluate('window.__fightersQA.snapshot()');
 check(struck.witches[1].damageBarVisible&&struck.witches[1].damageBarColor===0x6bd65d,
   'Damaged friendly units must briefly show a green world-space health meter');
 check(struck.witches.filter(u=>u.role!=='worker').every(u=>
   u.attackTargetId===struck.orcs[0].id),
   'Nearby autonomous witch guards must retaliate when a worker is struck');
 // Reuse this match for both village alarms; each faction can be put on
 // alert independently without reconstructing all seven animated units.
 check(await evaluate('window.__fightersQA.placeUnit("witch",0,0,0)'),
   'Could not position a distant witch defender');
 check(await evaluate('window.__fightersQA.placeUnitBesideBuilding("orc",0,"witch-house-01")'),
   'Could not position a raider at the witch headquarters');
 check(await evaluate("window.__fightersQA.strikeBuilding('orc',0,'witch-house-01',650)"),
   'Could not simulate a raid on the witch headquarters');
 let alarm=await evaluate('window.__fightersQA.snapshot()');
 check(alarm.witches[0].attackTargetId===alarm.orcs[0].id&&
   alarm.witches[2].attackTargetId===alarm.orcs[0].id&&
   alarm.witches[1].repairTargetId==='witch-house-01',
   'Far-away witches must defend their village and a worker must urgently repair the house: '+
   JSON.stringify({witches:alarm.witches,house:alarm.house}));
 await evaluate('window.__fightersQA.advance(.5)');
 alarm=await evaluate('window.__fightersQA.snapshot()');
 check(alarm.witches[0].attackTargetId===alarm.orcs[0].id,
   'A village defender must keep the emergency order while the AI plans its next raid');
 await evaluate('window.__fightersQA.enableWitchAI(false);window.__fightersQA.enableOrcAI(true)');
 check(await evaluate('window.__fightersQA.placeUnit("orc",0,0,0)'),
   'Could not position a distant orc defender');
 const emergencyHut=(await evaluate('window.__fightersQA.snapshot()')).buildings.find(b=>b.type==='hut');
 check(await evaluate('window.__fightersQA.placeUnitBesideBuilding("witch",0,'+
   JSON.stringify(emergencyHut.id)+')'),
   'Could not position a witch raider at the orc hut');
 check(await evaluate('window.__fightersQA.strikeBuilding("witch",0,'+
   JSON.stringify(emergencyHut.id)+',160)'),
   'Could not simulate an attack on the orc village');
 alarm=await evaluate('window.__fightersQA.snapshot()');
 check(alarm.orcs.filter(u=>u.role!=='worker').every(u=>
   u.attackTargetId===alarm.witches[0].id)&&
   alarm.orcs[1].repairTargetId===emergencyHut.id,
   'Distant orcs must rush to defend the hut and the worker must repair it: '+
   JSON.stringify(alarm.orcs));
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.wood.witch===250&&s.wood.orc===350,'Wood reserve must belong to each faction');
 check(s.witches.map(u=>u.role).join(',')==='melee,worker,ranged',
  'Witches must start with worker, melee and ranged roles');
 check(s.orcs.map(u=>u.role).join(',')==='melee,worker,ranged,melee',
  'Orcs must start with one worker and two distinct fighter types');
 const hairStyles=new Set(['short','long','very-long','ponytail','side-buns']);
 const hairColors=new Set(['black','blonde','white','brown','red','gray','green']);
 check(s.witches.every(u=>hairStyles.has(u.hairStyle)&&hairColors.has(u.hairColor)),
  'Initial witches must each keep a valid randomized hair style and color');
 check(s.assets.sourceRigs===2&&s.assets.roleModelsLoaded===0,
  'Six roles must use only the two Quaternius rigs');
  check(s.witches[1].workTool==='Worker_Scythe'&&!s.witches[1].workToolVisible&&
    s.orcs[1].workTool==='Worker_Axe'&&!s.orcs[1].workToolVisible&&
    [s.witches[1],s.orcs[1]].every(u=>u.hammerTool==='Worker_Hammer'&&!u.hammerToolVisible)&&
    [s.witches[1],s.orcs[1]].every(u=>u.pickTool==='Worker_Pickaxe'&&!u.pickToolVisible)&&
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
 const orcAppearance=await evaluate('window.__fightersQA.auditOrcAppearance()');
 check(orcAppearance.length===4&&orcAppearance.every(o=>
   o.bones===65&&o.garmentMeshes>=4&&o.bulkyMeshes===o.garmentMeshes&&
   o.changedVertices>0&&o.skeletonScaleUnchanged&&
   (o.socketOnOriginalHand===null||o.socketOnOriginalHand===true)&&
   [0x65f31a,0x83fa27,0x4ae919,0x76f52a].includes(o.skinColor)&&
   o.glow===o.skinColor&&o.glowIntensity>=.35),
   'Orcs must be bright green and broad with the original animated hands and rig: '+
   JSON.stringify(orcAppearance));
 console.log('PASS ORC SILHOUETTES AND GRIPS:',JSON.stringify(orcAppearance));
 // The HUMAN clan also needs an alarm. Previously disabling its AI disabled
 // every building-hit response and left grouped fighters idling during raids.
 await evaluate('window.__fightersQA.enableWitchAI(false)');
 check(await evaluate('window.__fightersQA.placeUnitBesideBuilding("orc",0,"witch-house-01")'),
   'Could not place the attacker at the player witches village');
 check(await evaluate("window.__fightersQA.strikeUnit('orc',0,'witch',1,4)"),
   'Could not trigger a local attack on a player witch worker');
 let playerAlarm=await evaluate('window.__fightersQA.snapshot()');
 check(playerAlarm.witches.filter(u=>u.role!=='worker').every(u=>
   u.attackTargetId===playerAlarm.orcs[0].id),
   'Player guards must protect a worker without requiring autonomous AI');
 check(await evaluate("window.__fightersQA.strikeBuilding('orc',0,'witch-house-01',10)"),
   'Could not trigger the player-controlled witch village alarm');
 playerAlarm=await evaluate('window.__fightersQA.snapshot()');
 check(playerAlarm.witches.filter(u=>u.role!=='worker').every(u=>
   u.attackTargetId===playerAlarm.orcs[0].id&&u.defenseAnchor),
   'Idle player witches must rush to defend their home despite AI being disabled');
 check(await evaluate('window.__fightersQA.moveUnitTo("orc",0,0,0)'),
   'Could not move the raider past the village defense leash');
 await evaluate('window.__fightersQA.advance(.12)');
 playerAlarm=await evaluate('window.__fightersQA.snapshot()');
 check(playerAlarm.witches.filter(u=>u.role!=='worker').every(u=>
   u.attackTargetId!==playerAlarm.orcs[0].id&&!u.defenseAnchor),
   'Defenders must release a raider that flees far beyond the village leash');
 await evaluate('window.__fightersQA.enableOrcAI(false)');
 const playerHut=(await evaluate('window.__fightersQA.snapshot()')).buildings.find(b=>b.type==='hut');
 check(await evaluate('window.__fightersQA.placeUnitBesideBuilding("witch",0,'+
   JSON.stringify(playerHut.id)+')'),
   'Could not place the attacker at the player orcs village');
 check(await evaluate("window.__fightersQA.strikeUnit('witch',0,'orc',1,4)"),
   'Could not trigger a local attack on a player orc worker');
 playerAlarm=await evaluate('window.__fightersQA.snapshot()');
 const workerOrc=playerAlarm.orcs.find(u=>u.role==='worker');
 const nearbyOrcGuards=playerAlarm.orcs.filter(u=>u.role!=='worker'&&
   Math.hypot(u.x-workerOrc.x,u.z-workerOrc.z)<=18);
 check(nearbyOrcGuards.length>=2&&nearbyOrcGuards.every(u=>
   u.attackTargetId===playerAlarm.witches[0].id),
   'Nearby player orc guards must protect a worker without autonomous AI');
 check(await evaluate('window.__fightersQA.strikeBuilding("witch",0,'+
   JSON.stringify(playerHut.id)+',10)'),
   'Could not trigger the player-controlled orc village alarm');
 playerAlarm=await evaluate('window.__fightersQA.snapshot()');
 check(playerAlarm.orcs.filter(u=>u.role!=='worker').every(u=>
   u.attackTargetId===playerAlarm.witches[0].id&&u.defenseAnchor),
   'Idle player orcs must also defend without an autonomous director');
 await evaluate('window.__fightersQA.spawnWitches(20)');
 const hairCrowd=(await evaluate('window.__fightersQA.snapshot()')).witches;
 check(new Set(hairCrowd.map(u=>u.hairStyle)).size===5&&
   new Set(hairCrowd.map(u=>u.hairColor)).size===7,
   'Randomized witch hair must cover all five styles and seven colors in a crowd');
 await evaluate('window.__fightersQA.reset()');
 console.log('PASS SIX CHARACTER ROLES: shared bodies and costume geometry, separate worker/melee/ranged stats.');
 // Repair is a direct building tap with a selected worker, including the
 // starting witch house. It must not select the building or spend resources.
 await evaluate("window.__fightersQA.enableOrcAI(false);window.__fightersQA.setBuildingHealth('witch-house-01',300);"+
   "window.__fightersQA.selectUnit('witch',1)");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>"+
   "b.textContent.includes('Réparer')&&!b.disabled)"),
   'A worker with damaged allied structures must expose an enabled Repair command');
 const beforeRepair=await evaluate('window.__fightersQA.snapshot()');
 const houseTap=await evaluate("window.__fightersQA.buildingScreenPoint('witch-house-01')");
 await evaluate('window.__fightersQA.tap('+houseTap.x+','+houseTap.y+')');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches[1].repairTargetId==='witch-house-01'&&s.selectedIds.length===0&&
   !s.selectedBuildingId,'Tapping an allied damaged house must order a selected worker to repair it');
 const repairWorking=await evaluate("(()=>{for(let i=0;i<36;i++){"+
   "window.__fightersQA.advance(.25);const s=window.__fightersQA.snapshot();"+
   "if(s.house.health>300&&s.witches[1].hammerToolVisible)return s;}"+
   "return window.__fightersQA.snapshot();})()");
 check(repairWorking.house.health>300&&repairWorking.witches[1].hammerToolVisible&&
   repairWorking.witches[1].animation==='Work_Swing',
   'Witch worker must stand at building edge and repair with a hammer');
 await evaluate('window.__fightersQA.advance(7)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.house.health===s.house.maxHealth&&!s.repairs.length&&
   s.gold.witch===beforeRepair.gold.witch&&s.wood.witch===beforeRepair.wood.witch,
   'Repair must quickly reach exactly max health, finish, and not spend resources');
 await evaluate("window.__fightersQA.setBuildingHealth('witch-house-01',200);"+
   "window.__fightersQA.selectUnit('witch',1);"+
   "Array.from(document.querySelectorAll('#command-buttons button')).find(b=>"+
   "b.textContent.includes('Réparer')).click()");
 check((await evaluate('window.__fightersQA.snapshot()')).witches[1].repairTargetId==='witch-house-01'&&
   (await evaluate('window.__fightersQA.snapshot()')).selectedIds.length===0,
   'Repair panel action must find the nearest damaged allied building');
 await evaluate("window.__fightersQA.selectUnit('witch',1)");
 await evaluate('window.__fightersQA.move(-8,-8)');
 check(!(await evaluate('window.__fightersQA.snapshot()')).repairs.length,
   'Explicit movement must cancel the repair job');
 // The witch repair cancellation has not touched Orc structures or troops.
 await evaluate('window.__fightersQA.setFaction("orc")');
 s=await evaluate('window.__fightersQA.snapshot()');
 const orcHut=s.buildings.find(b=>b.type==='hut');
 await evaluate('window.__fightersQA.setBuildingHealth('+JSON.stringify(orcHut.id)+',30);'+
   'window.__fightersQA.centerCamera(22,20);window.__fightersQA.selectUnit("orc",1)');
 const hutTap=await evaluate('window.__fightersQA.buildingScreenPoint('+JSON.stringify(orcHut.id)+')');
 await evaluate('window.__fightersQA.tap('+hutTap.x+','+hutTap.y+')');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.orcs[1].repairTargetId===orcHut.id&&s.selectedIds.length===0,
   'Orc worker must repair a damaged allied hut by tap and become deselected');
 await evaluate('window.__fightersQA.advance(10)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.find(b=>b.id===orcHut.id).health===orcHut.maxHealth&&
   !s.repairs.length,'Orc worker must finish repairing the hut');
 check(!await evaluate('window.__fightersQA.orderRepair("orc",1,"witch-house-01")')&&
   !await evaluate('window.__fightersQA.orderRepair("orc",0,'+JSON.stringify(orcHut.id)+')')&&
   !await evaluate('window.__fightersQA.orderRepair("orc",1,"neutral-gold-mine-01")'),
   'Enemy buildings, fighter units, and neutral deposits may not be repaired');
 await evaluate('window.__fightersQA.reset()');
 console.log('PASS BUILDING REPAIR: direct taps, panel button, hammer, both clans, cancellation, ownership and caps.');
 await until('window.__fightersQA.snapshot().crops.loaded',
   'real six-stage source model for wheat and wild berry bushes',30000);
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.berries.circularClipping,
   'Real square crop models must be trimmed by a circular shader mask');
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
 await evaluate("window.__fightersQA.passive(null)");
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
 await evaluate('window.__fightersQA.reset()');
 for(const [kind,workerIndex,treeIndex] of [['witch',1,0],['orc',1,5]]){
   await evaluate("window.__fightersQA.enableOrcAI(false);"+
     "window.__fightersQA.setFaction('"+kind+"')");
   if(kind==='orc')await evaluate('window.__fightersQA.centerCamera(15,18)');
   await evaluate("window.__fightersQA.selectUnit('"+kind+"',"+workerIndex+")");
   const point=await evaluate('window.__fightersQA.treeScreenPoint('+treeIndex+')');
   check(point&&Number.isFinite(point.x)&&Number.isFinite(point.y),
     'Tree cannot be selected at its visible 3D trunk');
   await evaluate('window.__fightersQA.tap('+point.x+','+point.y+')');
   s=await evaluate('window.__fightersQA.snapshot()');
   check(s.forestry.workers.some(w=>w.clan===kind&&w.index===treeIndex)&&
     s.selectedIds.length===0,
     'Tapping the tree must order the '+kind+' worker to chop, not to mine or attack');
   const chop=await evaluate("(()=>{let swinging=false;for(let i=0;i<320;i++){"+
     "window.__fightersQA.advance(.25);const s=window.__fightersQA.snapshot();"+
     "const w=s."+(kind==='witch'?'witches':'orcs')+"["+workerIndex+"];"+
     "if(w?.animation==='TreeChopping_Loop'&&"+
     (kind==='witch'?"w.chopToolVisible&&!w.workToolVisible":
       "w.workToolVisible&&!w.chopToolVisible")+"&&!w.hammerToolVisible)swinging=true;"+
     "if(s.forest.felled)return {swinging,forest:s.forest};"+
     "}return {swinging,forest:window.__fightersQA.snapshot().forest};})()");
   check(chop.swinging&&chop.forest.felled===1&&chop.forest.instances===90&&
     chop.forest.obstacleCount===90&&chop.forest.logBundles===1&&
     chop.forest.trees[treeIndex].felled,
     'Felling must use a visible axe, remove exactly one tree obstacle and leave GLB logs: '+
     JSON.stringify(chop));
   await evaluate("window.__fightersQA.selectUnit('"+kind+"',"+workerIndex+")");
   check(await evaluate("window.__fightersQA.orderCollectWood('"+kind+"',"+
     workerIndex+","+treeIndex+")")&&
     (await evaluate('window.__fightersQA.snapshot()')).selectedIds.length===0,
     'Assigning log pickup must deselect the worker');
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
   if(kind==='witch'){
     const followUp=delivery.s.forestry.workers.find(w=>w.clan==='witch');
     check(followUp&&followUp.index!==treeIndex,
       'Witch lumberjack must automatically start another visible, safe wood run');
     const nextTree=delivery.s.forest.trees[followUp.index];
     check(nextTree&&!nextTree.felled&&
       Math.hypot(nextTree.x-22,nextTree.z-22)>=11&&
       (await evaluate('window.__fightersQA.fogAt('+nextTree.x+','+nextTree.z+',"witch")')).explored>.2,
       'Automatic lumber must remain on explored ground away from the enemy village');
   }
   s=await evaluate('window.__fightersQA.snapshot()');
   check(s.buildings.every(b=>b.id!=='tree-'+treeIndex),
     'Forest trees are terrain resources, not attackable buildings');
   await evaluate('window.__fightersQA.reset()');
   s=await evaluate('window.__fightersQA.snapshot()');
   check(s.forest.instances===91&&s.forest.felled===0&&
     s.forest.obstacleCount===91&&s.forest.logBundles===0,
     'Reset must restore every tree and release all log bundle scene nodes');
 }
 console.log('PASS FORESTRY: both clans axe-fell actual CC0 trees to tiny CC0 log bundles; reset clears them.');
 const noWoodSite=await findWitchSite('witch-house');
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
 const expectedMiniPan=await evaluate('window.__fightersQA.mapToWorld(-21,-21)');
 check(Math.hypot(miniPan.x-expectedMiniPan.x,miniPan.z-expectedMiniPan.z)<1,
  'Clicking the square minimap must recenter the isometric camera: '+JSON.stringify(miniPan));
 const mapCorners=await evaluate('window.__fightersQA.mapCorners()');
 const minCornerX=Math.min(...mapCorners.map(c=>c.x));
 const maxCornerX=Math.max(...mapCorners.map(c=>c.x));
 const minCornerY=Math.min(...mapCorners.map(c=>c.y));
 const maxCornerY=Math.max(...mapCorners.map(c=>c.y));
 check(Math.abs((maxCornerX-minCornerX)-(maxCornerY-minCornerY))<1&&
   mapCorners.every(c=>(Math.abs(c.x-minCornerX)<1||Math.abs(c.x-maxCornerX)<1)&&
     (Math.abs(c.y-minCornerY)<1||Math.abs(c.y-maxCornerY)<1)),
   'The world terrain itself must project as a square in isometric view: '+JSON.stringify(mapCorners));
 check(await evaluate('!window.__fightersQA.isClear(54,54)&&'+
   '!window.__fightersQA.isClear(-54,54)&&window.__fightersQA.isClear(0,0)'),
   'Navigation must obey the new camera-aligned map boundaries');
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
 const fixedZoom=35/(3*1.35);
 check(Math.abs(steady.cameraZoom-fixedZoom)<1e-7&&
   Math.abs(steady.cameraCenter.x+18)<.05&&
   Math.abs(steady.cameraCenter.z+14)<.05,
   'Game must begin 4.05× closer and centered on starting witches: '+
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
 check(fogState.activeFaction==='witch'&&fogState.size===332&&
   fogState.bytes===1322688&&fogState.visibleCells>0&&
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
 console.log('PASS FRIENDLY UNIT TAPS: mouse events and prominent, unobstructed selection rings.');

 // Building taps must hit the actual flat X/Z polygon, never the larger
 // projected 3D visual AABB or a roof overhang.
 // Reset selection, not the whole match: a selected fighter would interpret
 // a friendly building tap as a movement order.
 await evaluate('window.__fightersQA.selectHouse()');
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
 check(s.house.level===2&&s.house.maxHealth===2250,'House upgrade level/HP failed');
 check(await evaluate('window.__fightersQA.train()'),'Upgraded house cannot train');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.house.queue[0].duration<3.5,'House upgrade should improve training time');
 await evaluate('window.__fightersQA.advance(3)');
 check((await evaluate('window.__fightersQA.snapshot()')).witches.length===5,
  'Upgraded house production failed');
 // The on-screen move marker is intentionally culled for distant orders.
 // Check feedback at the camera centre, then separately test long travel.
 await evaluate('window.__fightersQA.selectWitches();window.__fightersQA.move(-18,-14)');
 check(await evaluate("document.querySelector('.order-ping.move')!==null"),
   'Move order needs a blue fading marker');
 await evaluate('window.__fightersQA.move(-3,-3)');
 await until("window.__fightersQA.snapshot().ui.activePings===0",'blue order reticle cleanup',10000);
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.selectedIds.length===5,'RTS group selection failed');
 const before=s.witches[0];
 await evaluate('window.__fightersQA.advance(1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(s.witches[0].x-before.x,s.witches[0].z-before.z)>1,
  'Group move order not followed');
 check(s.witches[0].animation==='Walk_Loop'&&s.witches[0].animationRate===1.25,
   'Walk-loop keyframes must play 25% faster without changing movement speed');

 await until('window.__fightersQA.snapshot().blueprints.length===5',
  'Five real orc building blueprints',100000);
 await until('window.__fightersQA.snapshot().hares.loaded',
  'External real low-poly hare GLB',30000);
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.hares.models===16&&s.hares.animals.length===16&&
   s.hares.animals.some(h=>h.active)&&
   s.hares.animals.every(h=>h.active||h.respawnIn>0),
   'Sixteen independent hares must share a genuine 3D model, including hares awaiting respawn');
 const hareAnimation=await evaluate("(()=>{let highest=0,landings=0;"+
   "for(let i=0;i<8;i++){window.__fightersQA.advance(.21);"+
   "for(const h of window.__fightersQA.snapshot().hares.animals){"+
   "if(h.moving){highest=Math.max(highest,h.hopHeight);"+
   "if(h.hopHeight<.05)landings++;"+
   "if(Math.abs(h.renderedHeight-h.hopHeight)>.0001)throw Error('Hare mesh not animated');"+
   "}}}return {highest,landings}})()");
 check(hareAnimation.highest>.16&&hareAnimation.landings>0,
   'Running hares must visibly jump, stretch and land instead of sliding: '+
   JSON.stringify(hareAnimation));
 check(s.orcFood.housingCap===10&&s.orcFood.mageUnlocked,
   'Initial hut must house six extra orcs and cauldron must unlock mages');
 const deposits=s.buildings.filter(b=>b.type==='mine');
 check(s.buildings.filter(b=>b.clanId==='orcs').length===4&&
  deposits.length===4&&deposits.every(b=>b.clanId==='neutral'&&
    !b.destructible&&!b.destroyed&&b.healthbarParent===null&&b.queue.length===0),
  'All four natural deposits must be neutral, permanent resources outside clan infrastructure');
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
   "document.querySelector('#command-health').textContent.includes('Or restant : 8000 / 8000')&&"+
   "!Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Améliorer'))"),
   'Natural deposit HUD must display remaining gold instead of building health');
 await evaluate("window.__fightersQA.setFaction('orc');window.__fightersQA.selectOrcBarrack()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.selectedBuilding==='barrack','Orc barrack contextual selection');
 check(await evaluate("['Ouvrier','Guerrier','Lanceur-mage'].every(name=>Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes(name)))"),
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

 // The newer 8-unit settlement rule disallows the original isolated
 // (8,-10) fixture. Find a real attached site with a usable traversal lane.
 const hutSite=await evaluate("(()=>{const q=window.__fightersQA;"+
   "for(let z=10;z<=27;z++)for(let x=9;x<=27;x++){"+
   "if(q.canBuild(x,z,'hut')&&q.isClear(x-5,z)&&q.isClear(x+5,z))"+
   "return {x,z,from:x-5,to:x+5};}return null})()");
 check(hutSite,'No contiguous 8-unit orc hut site with a pathfinding lane');
 check(await evaluate("window.__fightersQA.beginBuild('hut')"),'Hut placement action refused');
 check(await evaluate("!!window.__fightersQA.build('hut',"+hutSite.x+','+hutSite.z+")"),'Orc hut construction failed');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.every(b=>b.hitbox.shape==='polygon'&&b.hitbox.vertexCount>10),
   'Orc buildings must all use real GLB-projected multi-polygons');
 check(s.buildings.length===9&&s.buildings.filter(b=>b.type==='hut').length===2,
  'Second hut must be a unique placed building');
 check(s.orcFood.housingCap===16,
   'Second level-one hut must provide six more population slots');
 check(!await evaluate("!!window.__fightersQA.build('hut',"+hutSite.x+','+hutSite.z+")"),
  'Colliding building placement must be refused');
 check(!await evaluate('window.__fightersQA.isClear('+hutSite.x+','+hutSite.z+')'),
  'Real solid building collider must block its centre');
 const newHut=s.buildings.find(b=>!b.initial);
 check(newHut?.hitbox.minX<hutSite.x&&newHut.hitbox.maxX>hutSite.x,
   'Constructed hut hitbox does not cover mesh');
 const house=s.house.hitbox;
 check(!await evaluate('window.__fightersQA.isClear('+((house.minX+house.maxX)/2)+','+
  ((house.minZ+house.maxZ)/2)+')'),'Witch house collider is not solid');

 // Original WarConquer-inspired A* must route around our ACTUAL placed hut.
 const planned=await evaluate('window.__fightersQA.route({x:'+hutSite.from+',z:'+hutSite.z+
   '},{x:'+hutSite.to+',z:'+hutSite.z+'})');
 check(planned?.waypoints?.length>=2,'Pathfinding did not detour around the hut');
 await evaluate("window.__fightersQA.moveUnitTo('orc',0,"+hutSite.from+','+hutSite.z+
   ");window.__fightersQA.selectUnit('orc',0);window.__fightersQA.move("+
   hutSite.to+','+hutSite.z+")");
 const travel=await evaluate("window.__fightersQA.auditTravel('orc',0,10)");
 check(travel.blocked===0,'A moving orc crossed a building collider: '+JSON.stringify(travel));
 check(travel.end.x>hutSite.to-2,
   'Orc did not navigate around hut to destination: '+JSON.stringify(travel));

 // Tap the projected real ground polygon, never the oversized 3D roof AABB.
 await evaluate('window.__fightersQA.centerCamera('+hutSite.x+','+hutSite.z+')');
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
 await runTouchQa({evaluate,call,check,until,screenshot,sleep,findWitchSite});
 await runResetQa({evaluate,check,findWitchSite});
}
