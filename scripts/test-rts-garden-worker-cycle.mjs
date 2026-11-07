import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-garden-worker-cycle.js');
const {Economy,HARVEST_SECONDS,FOOD_PER_HARVEST}=require('../docs/rts-farming.js');

function fixture(){
  const farming=new Economy();
  const garden={id:11,type:'garden',clanId:'witch',destroyed:false,
    root:{position:{x:0,z:0}}};
  const house={id:12,type:'witch-house',clanId:'witch',destroyed:false,
    root:{position:{x:6,z:0}}};
  const buildings=[garden,house],buildingInstances=new Map(buildings.map(b=>[b.id,b]));
  farming.addGarden(garden.id);
  const ready=()=>{
    for(const plot of farming.garden(garden.id).plots)plot.stage=3;
  };
  const worker=(id,x)=>({id,kind:'witch',role:'worker',dead:false,
    root:{position:{x,z:0}},route:{existing:true},approachCache:{existing:true}});
  const witch=worker(1,0),other=worker(2,3);
  const orc=worker(3,1);orc.kind='orc';
  const units=[witch,other,orc],events=[];
  let movement='moving',allowApproach=true;
  const distance=(a,b)=>Math.hypot(a.root.position.x-b.root.position.x,
    a.root.position.z-b.root.position.z);
  const cycle=create({units,buildingInstances,farming,
    roles:{isWorker:u=>u.role==='worker'},targetDistance:distance,
    liveBuildings:()=>buildings.filter(b=>!b.destroyed),buildingContact:1,
    approachBuilding:(actor,b)=>allowApproach?b.root.position:null,
    navigateActor:(actor,to,dt,mode)=>{
      events.push(['navigate',actor.id,to.x,to.z,mode]);return movement;
    },markWorkBlocked:actor=>{actor.workerRetryTime=6;events.push(['blocked',actor.id]);},
    animation:(actor,clip)=>events.push(['animation',actor.id,clip]),
    faceDirection:(actor,x,z)=>events.push(['face',actor.id,x,z]),
    farmHarvest:'Farm_Harvest',harvestSeconds:HARVEST_SECONDS,
    playEffect:(name,pos)=>events.push(['effect',name,pos.x]),
    mountCarriedWheat:actor=>{
      actor.carryWheat={visible:true};events.push(['wheat',actor.id]);
    },syncGardenVisual:b=>events.push(['sync',b.id]),
    refreshHUD:()=>events.push(['hud'])});
  return {farming,garden,house,buildings,buildingInstances,units,witch,other,orc,
    events,cycle,ready,setMovement:v=>{movement=v;},
    setApproach:v=>{allowApproach=v;}};
}

{
  const f=fixture();
  assert(Object.isFrozen(f.cycle));
  f.cycle.assign(.75);
  assert.equal(f.witch.farmJob,undefined,'Immature wheat attracts no worker');
  f.ready();
  f.cycle.assign(.74);
  assert.equal(f.witch.farmJob,undefined,'Automatic assignment is paced at 750 ms');
  f.cycle.assign(.01);
  assert.equal(f.witch.farmJob.gardenId,f.garden.id);
  assert.equal(f.witch.farmJob.phase,'harvest');
  assert.equal(f.witch.route,null);
  assert.equal(f.witch.approachCache,null);
  assert.equal(f.other.farmJob,undefined,'Only one worker per garden');
  f.cycle.assign(.75);
  assert.equal(f.other.farmJob,undefined,'Existing garden assignment is preserved');
  f.cycle.cancel(f.witch);
  f.witch.workerRetryTime=6;
  f.cycle.assign(.75);
  assert.equal(f.witch.farmJob,null,'Blocked worker is ineligible');
  assert.equal(f.other.farmJob.gardenId,f.garden.id,
    'The next closest free witch receives the garden');
  assert.equal(f.orc.farmJob,undefined,'Orcs never work witch gardens');
}

{
  const f=fixture();f.ready();
  f.cycle.assign(.5);f.cycle.reset();f.cycle.assign(.24);
  assert.equal(f.witch.farmJob,undefined,'Reset discards the elapsed assignment timer');
  f.cycle.assign(.51);
  assert.equal(f.witch.farmJob.gardenId,f.garden.id);
}

{
  const f=fixture();f.ready();f.cycle.assign(.75);
  assert.equal(f.cycle.tick(f.orc,.1),false,'Workers without jobs are skipped');
  f.witch.root.position.x=3;
  assert.equal(f.cycle.tick(f.witch,.1),true);
  assert.equal(f.witch.farmJob.plotIndex,0);
  assert(f.events.some(e=>e[0]==='navigate'&&e[2]===-.24&&e[3]===-1.1&&e[4]==='engage'),
    'The route enters the aisle between garden rows');
  assert.equal(f.farming.harvests,0,'Movement does not harvest wheat');
  f.witch.root.position.x=-.24;f.witch.root.position.z=-1.1;
  assert.equal(f.cycle.tick(f.witch,.39),true);
  assert.equal(f.farming.harvests,0);
  assert.equal(f.events.filter(e=>e[0]==='effect').length,0);
  f.cycle.tick(f.witch,.02);
  assert.deepEqual(f.events.filter(e=>e[0]==='effect').map(e=>e[1]),['garden'],
    'Garden audio triggers once after 400 ms of harvesting');
  assert(f.events.some(e=>e[0]==='face'&&e[2]<0));
  assert(f.events.some(e=>e[0]==='animation'&&e[2]==='Farm_Harvest'));
  f.cycle.tick(f.witch,1.18);
  assert.equal(f.farming.harvests,0,'Harvest lasts at least 1.6 seconds');
  f.cycle.tick(f.witch,.02);
  assert.equal(f.farming.harvests,1);
  assert.equal(f.farming.producedFood,FOOD_PER_HARVEST);
  assert.equal(f.farming.deliveredFood,0,'Harvest cargo is not credited before delivery');
  assert.equal(f.farming.food,45);
  assert.equal(f.witch.farmJob.amount,FOOD_PER_HARVEST);
  assert.equal(f.witch.farmJob.phase,'carry');
  assert.equal(f.witch.carryWheat.visible,true);
  assert.deepEqual(f.events.filter(e=>e[0]==='effect').map(e=>e[1]),['garden']);
  assert(f.events.some(e=>e[0]==='sync'&&e[1]===f.garden.id));
  f.cycle.tick(f.witch,.1);
  assert.equal(f.farming.food,45);
  f.witch.root.position.x=6;f.witch.root.position.z=0;
  f.cycle.tick(f.witch,.1);
  assert.equal(f.farming.food,45+FOOD_PER_HARVEST);
  assert.equal(f.farming.deliveredFood,FOOD_PER_HARVEST);
  assert.equal(f.witch.farmJob,null);
  assert.equal(f.witch.carryWheat.visible,false);
  assert(f.events.filter(e=>e[0]==='hud').length>=2);
}

{
  const f=fixture();f.ready();
  f.witch.farmJob={gardenId:f.garden.id,plotIndex:-1,progress:0,phase:'harvest',amount:0};
  f.other.farmJob={gardenId:f.garden.id,plotIndex:0,progress:0,phase:'harvest',amount:0};
  f.witch.root.position.x=.24;f.witch.root.position.z=-1.1;
  f.cycle.tick(f.witch,.1);
  assert.equal(f.witch.farmJob.plotIndex,1,'Two manual workers never reserve the same plot');
  f.cycle.cancel(f.witch);
  assert.equal(f.witch.farmJob,null);
  assert.equal(f.farming.harvests,0);
}

{
  const f=fixture();f.ready();f.cycle.assign(.75);
  f.witch.root.position.x=3;f.setMovement('blocked');
  assert.equal(f.cycle.tick(f.witch,.1),false);
  assert.equal(f.witch.farmJob,null,'Blocked garden approach cancels the job');
  assert.equal(f.witch.workerRetryTime,6);
  assert(f.events.some(e=>e[0]==='blocked'));
  f.witch.farmJob={gardenId:f.garden.id,plotIndex:-1,progress:0,phase:'harvest',amount:0};
  f.garden.destroyed=true;
  assert.equal(f.cycle.tick(f.witch,.1),false,'Destroyed gardens cancel jobs');
  assert.equal(f.witch.farmJob,null);
}

{
  const f=fixture();f.ready();
  f.witch.farmJob={gardenId:f.garden.id,plotIndex:-1,progress:0,
    phase:'carry',amount:FOOD_PER_HARVEST};
  f.witch.carryWheat={visible:true};
  f.house.destroyed=true;
  assert.equal(f.cycle.tick(f.witch,.1),true,'No witch home means wait with cargo');
  assert.equal(f.farming.food,45);
  assert.equal(f.witch.carryWheat.visible,true);
  f.house.destroyed=false;
  f.witch.root.position.x=0;f.setMovement('blocked');
  assert.equal(f.cycle.tick(f.witch,.1),true);
  assert.equal(f.witch.farmJob.retryWait,5,'Return path blocks retry without losing cargo');
  f.cycle.tick(f.witch,1);
  assert.equal(f.witch.farmJob.retryWait,4);
  assert.equal(f.farming.food,45);
  f.witch.farmJob.retryWait=0;f.setApproach(false);
  f.cycle.tick(f.witch,.1);
  assert.equal(f.witch.farmJob.retryWait,5,'Missing house approach also retries');
  f.cycle.cancel(f.witch);
  assert.equal(f.witch.carryWheat.visible,false);
  assert.equal(f.farming.food,45,'Cancel does not prematurely credit the harvest');
}

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersGardenWorkerCycle.create('));
for(const adapter of [
  'gardenCycle.reset()','return gardenCycle.cancel(actor)',
  'return gardenCycle.assign(dt)','return gardenCycle.tick(actor,dt)'
])assert(game.includes(adapter),`Garden worker adapter missing: ${adapter}`);
assert(!game.includes('farmAssignmentElapsed'),
  'Garden assignment timing belongs entirely to the extracted service');
console.log('PASS RTS garden workers: cadence, reservations, harvest, sound, cargo, retry, reset.');
