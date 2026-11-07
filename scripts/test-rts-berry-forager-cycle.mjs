import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../app/rts-berry-forager-cycle.js');
const {WildBerries,FORAGE_SIGHT,EAT_SECONDS,FOOD_PER_BUSH}=require('../app/rts-berries.js');
const {Economy}=require('../app/rts-farming.js');

function fixture(){
  const wildBerries=new WildBerries();
  wildBerries.bushes=[
    {id:0,x:0,z:0,stage:3,elapsed:0},
    {id:1,x:5,z:0,stage:3,elapsed:0},
    {id:2,x:10,z:0,stage:3,elapsed:0}
  ];
  const farming=new Economy();
  const actor=(id,kind,role,x)=>({id,kind,role,dead:false,
    profile:{sight:6},root:{position:{x,z:0}},route:{old:true},
    approachCache:{old:true}});
  const worker=actor(1,'witch','worker',.8),fighter=actor(2,'witch','melee',5.5);
  const ranged=actor(3,'witch','ranged',10.8),orc=actor(4,'orc','worker',.2);
  const units=[worker,fighter,ranged,orc],events=[];
  let hostile=new Set(),movement='moving';
  const cycle=create({units,wildBerries,farming,
    roles:{isFighter:u=>u.role!=='worker'},
    nearestHostile:(a,sight)=>{
      events.push(['scan',a.id,sight]);return hostile.has(a.id)?{target:orc}:null;
    },navigateActor:(a,to,dt,mode)=>{
      events.push(['navigate',a.id,to.id,mode]);return movement;
    },markWorkBlocked:a=>{a.workerRetryTime=6;events.push(['blocked',a.id]);},
    animation:(a,clip)=>events.push(['animation',a.id,clip]),
    faceDirection:(a,x,z)=>events.push(['face',a.id,x,z]),
    farmHarvest:'Farm_Harvest',forageSight:FORAGE_SIGHT,eatSeconds:EAT_SECONDS,
    syncBerryVisuals:()=>events.push(['sync']),
    refreshHUD:()=>events.push(['hud'])});
  return {cycle,wildBerries,farming,worker,fighter,ranged,orc,units,events,
    setHostile:id=>{hostile.add(id);},clearHostiles:()=>{hostile.clear();},
    setMovement:v=>{movement=v;}};
}

{
  const f=fixture();
  assert(Object.isFrozen(f.cycle));
  f.cycle.assign(.84);
  assert.equal(f.worker.berryJob,undefined,'Assignment waits 850 ms');
  f.cycle.assign(.01);
  assert.equal(f.worker.berryJob.index,0,'Nearest free witch gets the first bush');
  assert.equal(f.fighter.berryJob.index,1,'Combatant of any role may forage while safe');
  assert.equal(f.ranged.berryJob,undefined,'There can be only two live foragers');
  assert.equal(f.orc.berryJob,undefined,'Orcs do not forage Witch berries');
  assert.equal(f.worker.route,null);
  assert.equal(f.fighter.approachCache,null);
  f.cycle.assign(.85);
  assert.equal(f.ranged.berryJob,undefined,'Existing jobs count toward the cap');
  f.worker.berryJob=null;f.worker.destination={x:1,z:2};
  f.cycle.assign(.85);
  assert.equal(f.worker.berryJob,null,'Explicit destination excludes automatic foraging');
  assert.equal(f.ranged.berryJob.index,2,'A free slot lets the next Witch forage');
}

{
  const f=fixture();
  f.cycle.assign(.4);f.cycle.reset();f.cycle.assign(.45);
  assert.equal(f.worker.berryJob,undefined,'Reset discards assignment elapsed time');
  f.cycle.assign(.4);
  assert.equal(f.worker.berryJob.index,0);
}

{
  const f=fixture();f.setHostile(f.fighter.id);
  f.worker.constructJob={id:7};
  f.cycle.assign(.85);
  assert.equal(f.worker.berryJob,undefined,'Construction cannot be interrupted by foraging');
  assert.equal(f.fighter.berryJob,undefined,'Threatened fighters do not forage');
  assert.equal(f.ranged.berryJob.index,2,'Unthreatened ranged Witch can forage');
  assert(f.events.some(e=>e[0]==='scan'&&e[1]===f.fighter.id&&e[2]===6));
  f.fighter.berryJob={index:1,progress:0};
  assert.equal(f.cycle.tick(f.fighter,.1),false,'Existing forage aborts on enemy sight');
  assert.equal(f.fighter.berryJob,null);
}

{
  const f=fixture();
  f.wildBerries.bushes[1].stage=1;
  f.wildBerries.bushes[2].stage=1;
  f.worker.root.position.x=3;
  f.cycle.assign(.85);
  assert.equal(f.worker.berryJob,undefined,'Sight radius is strict, excluding exactly 3');
  f.worker.root.position.x=.8;
  f.cycle.assign(.85);
  assert.equal(f.worker.berryJob.index,0);
  f.worker.root.position.x=1.5;
  assert.equal(f.cycle.tick(f.worker,.1),true);
  assert(f.events.some(e=>e[0]==='navigate'&&e[1]===f.worker.id&&
    e[2]===0&&e[3]==='engage'));
  assert.equal(f.worker.berryJob.progress,0,'Travel time does not count as eating');
  f.setMovement('blocked');
  assert.equal(f.cycle.tick(f.worker,.1),true,'Blocked movement is consumed by the worker tick');
  assert.equal(f.worker.berryJob,null);
  assert.equal(f.worker.workerRetryTime,6);
  assert(f.events.some(e=>e[0]==='animation'&&e[2]==='Idle_Loop'));
  assert.equal(f.farming.food,45);
}

{
  const f=fixture();f.cycle.assign(.85);
  f.worker.root.position.x=.3;
  assert.equal(f.cycle.tick(f.worker,1.59),true);
  assert.equal(f.worker.berryJob.progress,1.59);
  assert.equal(f.farming.food,45);
  assert.equal(f.wildBerries.eaten,0);
  assert(f.events.some(e=>e[0]==='face'&&e[1]===f.worker.id));
  assert(f.events.some(e=>e[0]==='animation'&&e[2]==='Farm_Harvest'));
  f.cycle.tick(f.worker,.02);
  assert.equal(f.wildBerries.eaten,1,'One mature bush is consumed after 1.6 seconds');
  assert.equal(f.wildBerries.bushes[0].stage,1,'Consumed bush starts regrowth');
  assert.equal(f.worker.berryJob,null);
  assert.equal(f.farming.food,45+FOOD_PER_BUSH,'Food is credited on-site');
  assert.equal(f.farming.foragedFood,FOOD_PER_BUSH);
  assert.equal(f.events.filter(e=>e[0]==='sync').length,1);
  assert.equal(f.events.filter(e=>e[0]==='hud').length,1);
  assert.equal(f.events.at(-1)[2],'Idle_Loop');
  assert.equal(f.cycle.tick(f.worker,.1),false);
}

{
  for(const interrupt of ['stale','destination','attackOrder','woodJob']){
    const f=fixture();f.worker.berryJob={index:0,progress:.9};
    if(interrupt==='stale')f.wildBerries.bushes[0].stage=2;
    else f.worker[interrupt]={id:99};
    assert.equal(f.cycle.tick(f.worker,.8),false,interrupt);
    assert.equal(f.worker.berryJob,null,interrupt);
    assert.equal(f.farming.food,45,interrupt);
  }
}

{
  const f=fixture();f.worker.berryJob={index:999,progress:0};
  assert.equal(f.cycle.tick(f.worker,.1),false,'Missing bush cancels the task');
  assert.equal(f.worker.berryJob,null);
  f.worker.berryJob={index:0,progress:0};
  f.wildBerries.bushes[0].stage=3;
  f.wildBerries.eat(0);
  assert.equal(f.cycle.tick(f.worker,.1),false,'Already eaten bush is cancelled');
  assert.equal(f.farming.food,45);
}

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersBerryForagerCycle.create('));
for(const adapter of [
  'berryForagerCycle.reset()',
  'return berryForagerCycle.assign(dt)',
  'return berryForagerCycle.tick(actor,dt)'
])assert(game.includes(adapter),`Berry forager adapter missing: ${adapter}`);
assert(!game.includes('berryAssignmentElapsed'),
  'Berry assignment timing belongs entirely to the extracted service');
console.log('PASS RTS berry foragers: cadence, cap, proximity, danger, navigation, consumption and reset.');
