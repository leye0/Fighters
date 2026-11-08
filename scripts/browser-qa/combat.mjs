import {runSpellQa} from './spells.mjs';
import {addOrcBuilding} from './orc-fixtures.mjs';

export async function runCombatQa({evaluate,call,check,until,screenshot,sleep,findWitchSite}){
 let s;
 await until('window.__fightersQA.snapshot().blueprints.length===5',
   'Real Orc building models for combat QA',100000);
 await until('window.__fightersQA.snapshot().hares.loaded',
   'Real hares for combat QA',30000);
 await runSpellQa({evaluate,check});
 await evaluate('window.__fightersQA.reset()');
 const hutFixture=await addOrcBuilding(evaluate,'hut');
 check(hutFixture,'Cannot construct a test hut for the Orc siege scenarios');
 const hutId=hutFixture.id;

 // Real native animation, target acquisition, damage and destruction.
 await evaluate("window.__fightersQA.passive('orc');window.__fightersQA.selectUnit('witch',0)");

 await evaluate("window.__fightersQA.moveUnitTo('witch',0,"+(hutFixture.x-3.5)+","+hutFixture.z+")");
 // This fixture tests death/removal, not siege duration: a full-health hut
 // now deliberately takes far longer to demolish than the original 100-HP one.
 await evaluate('window.__fightersQA.setBuildingHealth('+JSON.stringify(hutId)+',60)');
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
 check(!destroyed||(destroyed.destroyed&&destroyed.health===0),
  'Witch attacks did not remove the newly constructed orc hut: '+JSON.stringify(destroyed));
 check(await evaluate('window.__fightersQA.isClear('+hutFixture.x+','+hutFixture.z+')'),
  'Destroyed building must be removed from the navigation grid');
 await screenshot('rts-destroyed-orc-hut');

 // Attack from different reachable directions; the issued order alone is
 // NOT success. Assert the target actually loses HP and enters the melee range.
 const sides=[
  {x:12,z:24},{x:20,z:26},{x:26,z:24},{x:25,z:16},
  {x:10,z:19},{x:26,z:19},{x:20,z:12},{x:14,z:26},
  {x:-12,z:-13}
 ];
 // One real match, nine independent approaches. Restore only the hut's HP
 // between angles: resetting the entire world would needlessly rebuild all
 // rigs, fog, forest and models nine times. Stop as soon as a *real* impact
 // proves the approach is navigable, rather than simulating 17–37 seconds
 // after the first hit for every direction.
 await evaluate("window.__fightersQA.reset();window.__fightersQA.passive('orc')");
 check(await addOrcBuilding(evaluate,'hut'),
   'Cannot construct a test hut for multi-angle approach scenarios');
 let attempted=0;
 for(const from of sides){
  const target=(await evaluate('window.__fightersQA.snapshot()')).buildings
    .find(b=>b.type==='hut'&&!b.destroyed);
  if(!await evaluate("window.__fightersQA.isClear("+from.x+","+from.z+")"))continue;
  await evaluate('window.__fightersQA.setBuildingHealth('+
    JSON.stringify(target.id)+','+target.maxHealth+')');
  await evaluate("window.__fightersQA.moveUnitTo('witch',0,"+from.x+","+from.z+");window.__fightersQA.selectUnit('witch',0)");
  check(await evaluate("window.__fightersQA.attackBuilding("+JSON.stringify(target.id)+")"),
    'Attack order failed for '+JSON.stringify(from));
  const attack=await evaluate("(()=>{for(let second=1;second<="+
    ((from.x<0)?42:21)+";second++){window.__fightersQA.advance(1);"+
    "const h=window.__fightersQA.snapshot().buildings.find(b=>b.id==="+
    JSON.stringify(target.id)+");if(h.health<"+target.maxHealth+")"+
    "return {seconds:second,health:h.health};}return null})()");
  check(attack?.health<target.maxHealth,
    'Witch remained idle outside enemy building attack range from '+JSON.stringify(from)+
    ' before='+target.maxHealth+' result='+JSON.stringify(attack)+
    ' witch='+JSON.stringify((await evaluate('window.__fightersQA.snapshot()')).witches[0]));
  attempted++;
 }
 check(attempted>=6,'Expected at least 6 distinct valid attack-angle trials, got '+attempted);
 console.log('PASS multi-angle building attacks:',attempted);

 // Regression: repeated Orc approaches must not grow the shared building
 // perimeter cache. The old unshift mutated it on every recalculation.
 // The Orc HQ has not been touched by the nine witch-side attack trials.
 await evaluate("window.__fightersQA.passive('witch');"+
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
 check(siegeCpuMs<14000&&s.house.health<s.house.maxHealth&&
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
 check(s.buildings.filter(b=>!b.destroyed&&b.clanId==='orcs').length>=2,
  'Orc village did not grow: '+JSON.stringify(s.buildings.map(b=>b.type)));
 check(s.buildings.filter(b=>!b.destroyed&&b.type!=='mine')
  .every(b=>b.healthbarParent==='scene'),
  'Autonomously built HP bars inherited building transforms');
 await screenshot('rts-orc-autonomous-village');
 // Victory requires destroying only clan buildings. All four neutral deposits
 // must survive the end of the match and remain navigational obstacles.
 const orcStructures=s.buildings.filter(b=>b.clanId==='orcs').map(b=>b.id);
 for(const id of orcStructures)
  await evaluate("window.__fightersQA.damageBuilding("+JSON.stringify(id)+",999999)");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(!s.running&&s.buildings.filter(b=>b.type==='mine').length===4&&
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
   "window.__fightersQA.trainRole('witch','melee')");
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

 // The GPU-lifecycle loop already restored a clean game after its last cycle.
 await evaluate('window.__fightersQA.enableOrcAI(false)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches.length===3&&s.orcs.length===4&&
  s.buildings.filter(b=>!b.destroyed).length===5,'Reset after AI restores starting match');
 // The playable faction comes from the start overlay, not the test-only
 // setFaction helper. Launch an actual orc match, then exercise the enemy AI.
 check(await evaluate("document.title==='Orks & Sorcières'"),
   'Browser title must use the new game name');
 await evaluate("document.querySelector('#overlay').hidden=false;"+
   "document.querySelector('#choose-orc').click()");
 check(await evaluate("document.querySelector('#choose-orc').getAttribute('aria-pressed')==='true'&&"+
   "document.querySelector('#choose-witch').getAttribute('aria-pressed')==='false'&&"+
   "!document.querySelector('#start').disabled"),
   'Orc faction must be selectable after the village is loaded');
 await evaluate("document.querySelector('#start').click()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.activeFaction==='orc'&&s.chosenFaction==='orc'&&s.orcs.length===4&&
   s.cameraCenter.x>10&&s.selectedBuildingId?.startsWith('orc-barrack'),
   'Starting as orcs must reveal their own base and select their barrack');
 check(await evaluate("document.querySelector('#hud-units-label').textContent==='👹 POP.'&&"+
   "document.querySelector('#unit-count').textContent==='4 / 4'&&"+
   "document.querySelector('.orc-population-status')?.textContent.includes('4 / 4')"),
   'Orc players must see their housing capacity directly, including on barracks');
 await evaluate('window.__fightersQA.enableWitchAI(true);window.__fightersQA.advance(12)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witchAI.decisions.some(a=>a.type==='train'||a.type==='build')&&
   s.witchAI.decisions.some(a=>a.type==='scout'),
   'Real witch director must independently recruit/build and scout');
 // The strategy must lead to finished, physical buildings, not only planned
 // intentions. This exercises real terrain/forest clearance, available
 // workers, construction travel, production and the opposing faction mode.
 await evaluate('window.__fightersQA.advance(85)');
 s=await evaluate('window.__fightersQA.snapshot()');
 const witchExpansion=s.buildings.filter(b=>b.clanId==='witch'&&!b.initial&&!b.destroyed);
 check(witchExpansion.length>=2&&witchExpansion.some(b=>b.type==='garden'),
   'Enemy Witch AI must actually construct multiple buildings while playing Orcs: '+
   JSON.stringify({buildings:witchExpansion,construction:s.construction,
     decisions:s.witchAI.decisions,gold:s.gold.witch,wood:s.wood.witch}));
 await evaluate("document.querySelector('#overlay').hidden=false;"+
   "document.querySelector('#choose-witch').click();document.querySelector('#start').click()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.activeFaction==='witch'&&s.chosenFaction==='witch'&&
   s.witches.length===3&&s.witchAI.decisions.length===0,
   'Choosing witches for a new match must reset the witch AI');
 // Orc hunger must progress independently of the witch food reserve.
 const orcHealth=s.orcs[0].health;
 await evaluate('window.__fightersQA.setOrcFood(0);window.__fightersQA.advance(2)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.orcFood.food===0&&s.orcs[0].health<orcHealth,
   'Starving orcs must lose HP even when witch food is available');
 await evaluate('window.__fightersQA.reset()');
 const cauldron=await addOrcBuilding(evaluate,'cauldron');
 check(cauldron,'Cannot build test Orc cauldron');
 check((await evaluate('window.__fightersQA.snapshot()')).orcFood.mageUnlocked,
   'Constructed cauldron must unlock mage production');
 await evaluate('window.__fightersQA.damageBuilding('+JSON.stringify(cauldron.id)+',99999)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(!s.orcFood.mageUnlocked&&
   !await evaluate("window.__fightersQA.trainRole('orc','ranged')"),
   'Lanceur-mage training must require a living cauldron');
 await evaluate('window.__fightersQA.reset();window.__fightersQA.setOrcFood(15)');
 check(await evaluate('window.__fightersQA.placeHareNearOrc(0,0)'),
   'Could not set up a visible hare near the orc army');
 await evaluate('window.__fightersQA.advance(15)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.orcFood.haresEaten>0&&s.hares.animals.some(h=>!h.active),
   'Hungry orcs must catch, eat and remove a roaming hare: '+
     JSON.stringify({food:s.orcFood,hares:s.hares,orcs:s.orcs.map(u=>({
       id:u.id,x:u.x,z:u.z,destination:u.destination,health:u.health}))}));
 await evaluate('window.__fightersQA.reset();window.__fightersQA.setOrcFood(100)');
 check(await evaluate('window.__fightersQA.spawnWitchCorpseNearOrc()')!=null,
   'Could not set up a witch corpse for the orc feast');
 await evaluate('window.__fightersQA.advance(1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.hares.foragers.some(job=>job.kind==='corpse')&&
   s.orcFood.corpsesEaten===0,
   'A nearby witch corpse must trigger a visible timed eating action, even with full food');
 await evaluate('window.__fightersQA.advance(3)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.orcFood.corpsesEaten===1&&s.orcFood.food>100,
   'An orc should feast once on a witch corpse for a substantial food reward');
 await evaluate('window.__fightersQA.reset()');
 check(await evaluate('window.__fightersQA.spawnWitchCorpseNearOrc(0,true)')!=null,
   'Could not set up an orc killing a nearby witch');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.hares.foragers.some(job=>job.kind==='corpse'),
   'The orc delivering the fatal blow must reserve the corpse for a visible feast');
 await evaluate('window.__fightersQA.advance(4)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.orcFood.corpsesEaten===1,
   'A victorious orc must finish consuming its fallen witch after combat');
}
