export async function runEconomyQa({evaluate,call,check,until,screenshot,sleep,findWitchSite}){
 let s;
 // These assets were awaited by the visual group in the serial version.
 await until('window.__fightersQA.snapshot().blueprints.length===5',
   'Real Orc building models for economy QA',100000);
 await until('window.__fightersQA.snapshot().hares.loaded',
   'Real animated hares for economy QA',30000);

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
 check(s.house.level===1&&s.buildings.length===8,'Reset starting buildings');
 check(s.buildings.filter(b=>b.type==='mine').length===4&&
   s.buildings.filter(b=>b.type==='mine').every(b=>b.goldRemaining===8000),
   'Two finite 8,000-gold deposits must be available on each side');
 const mines=s.buildings.filter(b=>b.type==='mine');
 check(mines.filter(b=>Math.hypot(b.x+23.5,b.z+17.5)<23).length===2&&
   mines.filter(b=>Math.hypot(b.x-15,b.z-20)<23).length===2,
   'Each clan needs exactly two distinct mines near its starting headquarters');
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
  const miningSwing=await evaluate("(()=>{const seen={witch:false,orc:false};let cargo=false,unpaid=false;"+
    "for(let i=0;i<38;i++){window.__fightersQA.advance(1);const s=window.__fightersQA.snapshot();"+
    "if(s.mining.workers.some(w=>w.clan==='witch'&&w.phase==='carry'&&w.carrying)){"+
    "cargo=true;if(s.gold.witch==="+witchGoldBefore+")unpaid=true;}"+
    "for(const kind of ['witch','orc'])if(s[kind==='witch'?'witches':'orcs'].some(u=>"+
    "u.role==='worker'&&u.animation==='Work_Swing'&&u.pickToolVisible&&"+
    "!u.workToolVisible&&!u.hammerToolVisible&&!u.chopToolVisible))seen[kind]=true;"+
    "if(seen.witch&&seen.orc&&cargo&&unpaid&&s.gold.witch>"+witchGoldBefore+
    "&&s.mining.totalMinedGold>0)break;}return {...seen,cargo,unpaid}})()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.gold.witch>witchGoldBefore&&s.mining.totalMinedGold>0,
  'Witch worker never mined physical gold: '+JSON.stringify(s.mining));
 check(s.buildings.filter(b=>b.type==='mine').some(b=>b.goldRemaining<8000)&&
   s.buildings.filter(b=>b.type==='mine').every(b=>b.goldRemaining>=0),
   'The physical ore reserves must decrease without going negative');
  check(miningSwing.witch&&miningSwing.orc,
    'Workers of both clans must swing a pickaxe, not a scythe/axe, when mining: '+JSON.stringify(miningSwing));
 check(miningSwing.cargo&&miningSwing.unpaid,
   'Gold must be visibly carried and NOT credited before arrival at a friendly base: '+
   JSON.stringify(miningSwing));
 check(s.mining.workers.every(u=>u.role==='worker'),
  'Non-worker character was assigned mining');
 // A construction order debits once, sends the worker to the real X/Z
 // perimeter and creates the structure only after its work animation.
 const site=await findWitchSite('witch-house');
 check(site,'No safe witch house construction site');
 const buildingsBefore=s.buildings.length,goldBeforeBuild=s.gold.witch,
  woodBeforeBuild=s.wood.witch;
 await evaluate("window.__fightersQA.selectUnit('witch',1)");
 check(await evaluate('window.__fightersQA.orderBuild("witch-house",'+site.x+','+site.z+')'),
  'Witch worker could not start a construction job');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===buildingsBefore&&s.construction.length===1&&
  s.selectedIds.length===0&&
  s.construction[0].previewVisible&&s.constructionPreviewCount===1&&
  s.gold.witch===goldBeforeBuild-230&&s.wood.witch===woodBeforeBuild-75,
  'Construction must reserve both gold and wood and wait for worker');
  const constructionVisual=await evaluate("(()=>{let seen=false,revealed=false;for(let i=0;i<38;i++){"+
    "window.__fightersQA.advance(1);const s=window.__fightersQA.snapshot();"+
    "revealed ||= s.construction.some(j=>j.revealFraction>.2&&j.revealFraction<.95);"+
    "seen ||= s.witches.some(u=>"+
    "u.role==='worker'&&u.animation==='Work_Swing'&&u.hammerToolVisible&&"+
    "!u.pickToolVisible&&!u.workToolVisible);"+
    "if(seen&&revealed&&s.construction.length===0&&s.buildings.length>"+buildingsBefore+
    ")break;}return {seen,revealed}})()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.construction.length===0&&s.buildings.length===buildingsBefore+1&&
  s.constructionPreviewCount===0&&
  s.buildings.some(b=>b.type==='witch-house'&&b.clanId==='witch'),
  'Witch worker did not finish a real house: '+JSON.stringify(s.construction));
  check(constructionVisual.seen,'House construction must show a hammer, never a scythe');
  check(constructionVisual.revealed,'The actual building must reveal from bottom to top during work');
 console.log('PASS ECONOMIC ROLES: witch mined gold, constructed a shared-model house; soldiers cannot mine, workers cannot fight.');
 await evaluate('window.__fightersQA.reset()');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.buildings.length===8,'Reset must remove the additional witch house');
 check(await evaluate('window.__fightersQA.isClear(8,-10)'),
  'Reset must remove constructed building hitboxes');

 // A real CC0 menhir circle is constructed by a witch worker. Its six stones
 // block only their own small footprints, leaving the glowing middle walkable.
 await until('window.__fightersQA.snapshot().healing.modelLoaded',
   'bundled CC0 standing-stone model',30000);
 check(!await evaluate("window.__fightersQA.beginBuild('stone-circle')")&&
   !await evaluate("window.__fightersQA.trainRole('witch','ranged')"),
   'Circle construction and Arcanist recruitment require their prerequisites');
 check(await evaluate('window.__fightersQA.upgradeHouse()'),
   'House must accept the upgrade that unlocks the stone circle');
 await evaluate('window.__fightersQA.advance(8.1)');
 check((await evaluate('window.__fightersQA.snapshot()')).souls.buildUnlocked,
   'Upgraded house did not unlock stone-circle construction');
 const stoneSite=await findWitchSite('stone-circle');
 check(stoneSite,'No buildable spot for the witch healing circle');
 check(await evaluate('window.__fightersQA.orderBuild("stone-circle",'+
   stoneSite.x+','+stoneSite.z+')'),'Witch worker could not start a healing circle');
 const stoneBuilt=await evaluate("(()=>{for(let i=0;i<45;i++){"+
   "window.__fightersQA.advance(1);if(window.__fightersQA.snapshot().healing.circles.length)"+
   "return true;}return false})()");
 check(stoneBuilt,'Witch worker did not finish the stone circle');
 s=await evaluate('window.__fightersQA.snapshot()');
 const sanctuary=s.healing.circles[0];
 check(s.healing.healthPerMagic===15&&s.souls.passiveMagicPer30Seconds===5,
   'Healing must cost 1 magic per 15 HP and magic must regenerate 5/30s');
 check(sanctuary.stones===6&&sanctuary.navigableCenter&&
   s.buildings.some(b=>b.id===sanctuary.id&&b.health===850),
   'Six actual menhirs must surround a walkable magic center: '+JSON.stringify(sanctuary));
 await evaluate('window.__fightersQA.centerCamera('+sanctuary.x+','+sanctuary.z+')');
 await screenshot('rts-stone-healing-circle');
 await evaluate('window.__fightersQA.selectBuildingById('+JSON.stringify(sanctuary.id)+')');
 check(await evaluate('document.querySelector("#command-title").textContent')==='Cercle de roches',
   'The sanctuary must be selectable with its own French HUD label');
 // Touching a friendly stone circle with witches selected must ORDER MOVEMENT,
 // not discard the squad selection to select the building. Compact goals
 // must all remain in the healing radius, including with three witches.
 const sanctuaryScreen=await evaluate('window.__fightersQA.buildingScreenPoint('+JSON.stringify(sanctuary.id)+')');
 check(sanctuaryScreen,'Stone circle should have a selectable ground point');
 await evaluate('window.__fightersQA.selectUnit("witch",0);'+
   'window.__fightersQA.tap('+sanctuaryScreen.x+','+sanctuaryScreen.y+')');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.selectedIds.length===1&&s.selectedBuildingId===null&&
   s.witches[0].destination&&Math.hypot(s.witches[0].destination.x-sanctuary.x,
     s.witches[0].destination.z-sanctuary.z)<1.4,
   'Tapping the sanctuary must send the selected witch into its healing centre: '+
   JSON.stringify({screen:sanctuaryScreen,site:sanctuary,selected:s.selectedIds,
     building:s.selectedBuildingId,raven:s.ravens.selectedId,
     destination:s.witches[0].destination}));
 await evaluate('window.__fightersQA.selectWitches();'+
   'window.__fightersQA.tap('+sanctuaryScreen.x+','+sanctuaryScreen.y+')');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.selectedIds.length===3&&s.selectedBuildingId===null&&
   s.witches.every(u=>u.destination&&Math.hypot(u.destination.x-sanctuary.x,
     u.destination.z-sanctuary.z)<1.4),
   'Three selected witches must receive compact sanctuary goals, not select the building: '+
   JSON.stringify({site:sanctuary,selected:s.selectedIds,
     building:s.selectedBuildingId,raven:s.ravens.selectedId,
     destinations:s.witches.map(u=>u.destination)}));
 console.log('PASS STONE CIRCLE TAP: solo and squad orders enter the healing radius.');
 // Place the recovery subject OUTSIDE the circle on an actually reachable
 // route. Construction may happen around an already idle starting witch.
 const recoveryStart=await evaluate("(()=>{const c=window.__fightersQA.snapshot().healing.circles[0];"+
   "for(const radius of [5,6,7,8])for(let i=0;i<32;i++){"+
   "const a=i*Math.PI/16,x=c.x+radius*Math.cos(a),z=c.z+radius*Math.sin(a);"+
   "if(x>-1||x<-27||z<-27||z>27||!window.__fightersQA.isClear(x,z))continue;"+
   "if(window.__fightersQA.route({x,z},{x:c.x,z:c.z}))return {x,z};}"+
   "return null})()");
 check(recoveryStart,'Stone circle must have an accessible entrance from its surroundings');
 await evaluate('window.__fightersQA.moveUnitTo("witch",0,'+recoveryStart.x+','+recoveryStart.z+');'+
   'window.__fightersQA.setUnitHealth("witch",0,24);window.__fightersQA.advance(1)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.witches[0].healingTarget===sanctuary.id,
   'A wounded idle witch should seek shelter while no enemy is nearby: '+
   JSON.stringify({site:sanctuary,start:recoveryStart,witch:s.witches[0]}));
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
 await evaluate('window.__fightersQA.moveUnitTo("orc",0,15,17)');
 check(s.souls.arcanistUnlocked&&await evaluate("window.__fightersQA.trainRole('witch','ranged')"),
   'Constructing the circle must unlock Arcanist training');
 await evaluate('window.__fightersQA.advance(5)');
 check((await evaluate('window.__fightersQA.snapshot()')).witches.filter(u=>u.role==='ranged').length>=2,
   'Arcanist production must finish after sanctuary unlock');
 const soulCorpseId=await evaluate('window.__fightersQA.spawnTestCorpseNearArcanist()');
 s=await evaluate('window.__fightersQA.snapshot()');
 const magicBeforeSoul=s.souls.magic;
 check(s.souls.corpses.some(c=>c.id===soulCorpseId&&c.remaining>110),
   'Fallen characters must leave persistent bodies');
 const spirit=await evaluate("(()=>{for(let i=0;i<24;i++){"+
   "window.__fightersQA.advance(.2);const s=window.__fightersQA.snapshot();"+
   "if(s.souls.activeSpirits)return s.souls.spirits[0];}return null;})()");
 check(spirit&&spirit.sameGeometry&&spirit.samePose&&spirit.sameTransform&&
   spirit.meshCount>=spirit.skinnedCount&&spirit.skinnedCount>0&&spirit.scale<1,
   'Soul must be the exact frozen 3D corpse, not a billboard: '+JSON.stringify(spirit));
 await screenshot('rts-soul-corpse-clone');
 await evaluate('window.__fightersQA.advance(1.5)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.souls.magic>=magicBeforeSoul+19&&s.souls.magic<=magicBeforeSoul+22&&
   s.souls.activeSpirits===0&&
   s.souls.corpses.some(c=>c.id===soulCorpseId&&c.claimed&&c.remaining>100),
   'Spirit must add 20 magic on top of passive regeneration while the corpse persists: '+JSON.stringify(s.souls));
 console.log('PASS SOULS: house upgrade, circle unlock, Arcanist training, persistent corpse, exact 3D white soul and magic gauge.');
 await evaluate('window.__fightersQA.damageBuilding('+JSON.stringify(sanctuary.id)+',999999)');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.healing.circles.length===0&&s.buildings.every(b=>b.id!==sanctuary.id),
   'Destroyed circles must be removed along with their menhir obstacles');
 await evaluate('window.__fightersQA.reset()');
 check((await evaluate('window.__fightersQA.snapshot()')).healing.circles.length===0,
   'Reset must not keep stone circles or their healing jobs');
 console.log('PASS STONE HEALING: actual menhirs, construction, walkable center, AI retreat, healing, destruction and reset.');

 // The wheat-only CC BY model has three distinct growth stages. Stage 3 stays ripe
 // until a physical witch worker harvests, then the crop begins again at 1.
 const gardenSite=await findWitchSite('garden');
 check(gardenSite,'No buildable garden site on witch territory');
 check(await evaluate('window.__fightersQA.orderBuild("garden",'+gardenSite.x+','+gardenSite.z+')'),
   'Witch worker could not begin garden construction');
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.construction.some(job=>job.type==='garden'&&job.previewVisible&&
   job.previewPlantMeshes===0),
   'An unfinished garden must show only soil beds, not fake spherical crops');
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
  const harvestGesture=await evaluate("(()=>{let seen=false,inside=false,carrying=false,"+
    "notCredited=false,delivered=false;for(let i=0;i<90;i++){"+
    "window.__fightersQA.advance(.5);const s=window.__fightersQA.snapshot();"+
    "if(s.farming.workers.some(w=>w.phase==='carry'&&w.carrying)){carrying=true;"+
    "notCredited ||= s.farming.deliveredFood===0;}"+
    "if(s.farming.deliveredFood>=8){delivered=true;break;}"+
    "for(const u of s.witches)if(u.role==='worker'&&u.animation==='Farm_Harvest'&&"+
    "!u.workToolVisible&&!u.hammerToolVisible){seen=true;inside ||= " +
    "Math.abs(u.x-("+gardenSite.x+"))<1.2&&Math.abs(u.z-("+gardenSite.z+"))<1.6;}"+
    "}return {seen,inside,carrying,notCredited,delivered};})()");
 s=await evaluate('window.__fightersQA.snapshot()');
 check(s.farming.harvests>0&&s.farming.producedFood>=8,
   'Worker never reached and harvested mature crops: '+JSON.stringify(s.farming));
  check(harvestGesture.seen&&harvestGesture.inside&&harvestGesture.carrying&&
    harvestGesture.notCredited&&harvestGesture.delivered&&s.farming.deliveredFood>=8,
    'Witch must pick by hand, carry wheat home and only then stock food: '+
    JSON.stringify({gesture:harvestGesture,farming:s.farming}));
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
 await evaluate("window.__fightersQA.centerCamera(-18,-14)");
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

 // Reuse this match: test real stone geometry, navigation, and the worker's
 // bottom-to-top wall construction before combat's next scheduled reset.
 await until('window.__fightersQA.snapshot().blueprints.length===5',
   'Orc blueprint load for stone-wall acceptance',100000);
 await evaluate("window.__fightersQA.setFaction('orc')");
 const wallSite=await evaluate("(()=>{const q=window.__fightersQA;"+
   "const s=q.snapshot();const structures=s.buildings.filter(b=>b.clanId==='orcs'&&b.type!=='wall');"+
   "const sites=window.FightersWalls.perimeter(structures);"+
   "for(const p of sites){const dx=p.axis==='x'?3.2:0,dz=p.axis==='z'?3.2:0;"+
   "if(q.canBuildAxis(p.x,p.z,'wall',p.axis)&&"+
   "q.canBuildAxis(p.x+dx,p.z+dz,'wall',p.axis))"+
   "return {...p,dx,dz};}return null})()");
 check(wallSite,'No terrain supports two contiguous orc stone-wall sections');
 check(await evaluate('window.__fightersQA.beginBuild("wall")'),
   'Workers must be offered a stone-wall action in their construction menu');
 check(await evaluate('!!window.__fightersQA.buildWall('+wallSite.x+','+wallSite.z+','+
   JSON.stringify(wallSite.axis)+')'), 'Could not erect first stone wall');
 let wallState=await evaluate('window.__fightersQA.snapshot()');
 const first=wallState.buildings.find(b=>b.type==='wall');
 check(first&&first.health===280&&first.clanId==='orcs',
   'Stone wall needs ownership, health and a building collision shape');
 check(!await evaluate('window.__fightersQA.isClear('+first.x+','+first.z+')'),
   'The stone wall must be a hard unit-navigation obstacle');
 check(await evaluate('window.__fightersQA.scheduleConstruction("wall",'+
   (wallSite.x+wallSite.dx)+','+(wallSite.z+wallSite.dz)+','+
   JSON.stringify(wallSite.axis)+')'),
   'Worker must be able to schedule a neighboring wall segment');
 wallState=await evaluate('window.__fightersQA.snapshot()');
 check(wallState.construction.some(job=>job.type==='wall'&&job.previewVisible),
   'A wall under construction must render its rising stone preview');
 await evaluate('window.__fightersQA.advance(30)');
 wallState=await evaluate('window.__fightersQA.snapshot()');
 check(wallState.buildings.filter(b=>b.type==='wall'&&!b.destroyed).length===2&&
   !wallState.construction.some(job=>job.type==='wall'),
   'Worker must finish a second wall with a connected, solid joint');
 check(!await evaluate('window.__fightersQA.isClear('+
   (wallSite.x+wallSite.dx)+','+(wallSite.z+wallSite.dz)+')'),
   'Finished wall must enter navigation immediately');
 console.log('PASS STONE WALL WEBGL: build action, two connected instanced sections, worker reveal and solid navigation.');
}
