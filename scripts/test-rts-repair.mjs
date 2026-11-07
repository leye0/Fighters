import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const repair=require('../docs/rts-repair.js');
const worker={kind:'witch',role:'worker',dead:false};
const house={type:'witch-house',clanId:'witch',health:50,maxHealth:500,destroyed:false};
assert(repair.canRepair(worker,house),'An allied worker may repair a damaged house');
assert(!repair.canRepair({...worker,role:'melee'},house),'Only workers repair');
assert(!repair.canRepair({...worker,dead:true},house),'Dead workers cannot repair');
assert(!repair.canRepair({...worker,kind:'orc'},house),'Enemies cannot repair the house');
assert(!repair.canRepair(worker,{...house,clanId:'neutral',type:'mine'}),'No mining repairs');
assert(!repair.canRepair(worker,{...house,destroyed:true}),'Cannot revive destroyed buildings');
assert(!repair.canRepair(worker,{...house,health:0}),'Cannot repair a demolished house');
assert(!repair.canRepair(worker,{...house,health:500}),'Full-health buildings need no repair');
assert.equal(repair.restore(house,2),180);
assert.equal(house.health,230);
assert.equal(repair.restore(house,10),270,'Repair cannot exceed max health');
assert.equal(house.health,500);
assert.equal(repair.restore(house,1),0,'Full-health repairs do not grant bonus health');
assert.throws(()=>repair.restore(house,-1),/Invalid repair time/);
const orc={kind:'orc',role:'worker',dead:false};
const barrack={type:'barrack',clanId:'orcs',health:30,maxHealth:100,destroyed:false};
assert(repair.canRepair(orc,barrack));
assert.equal(repair.restore(barrack,1),18);

function repairFixture({health=30,maxHealth=100,position=0,
  clipDuration=1,healthBar=true}={}){
  const events=[];
  const actor={id:5,kind:'witch',role:'worker',dead:false,
    repairJob:{buildingId:'house'},position,
    clipCatalog:new Map([['Sword_Attack',{duration:clipDuration}]])};
  let building={id:'house',clanId:'witch',type:'witch-house',destroyed:false,
    x:0,health,maxHealth,healthBar:healthBar?{}:null};
  let path='moving',goal={x:0,z:0};
  const cycle=repair.createCycle({
    getBuilding:id=>id===building?.id?building:null,
    buildingContact:.78,targetDistance:(actor,target)=>Math.abs(actor.position-target.x),
    approachBuilding:()=>goal,
    navigateActor:(actor,target,dt,mode)=>{
      events.push(['navigate',target.x,dt,mode]);return path;
    },markWorkBlocked:actor=>{actor.workerRetryTime=6;events.push(['blocked']);},
    animation:(actor,name)=>events.push(['animation',name]),
    faceBuildingCenter:(actor,target)=>events.push(['face',target.id]),
    workSwing:'Work_Swing',playConstructionHit:actor=>events.push(['hammer',actor.id]),
    updateHealthBar:target=>events.push(['health',target.health]),
    showBanner:message=>events.push(['banner',message]),
    refreshHUD:()=>events.push(['hud'])
  });
  return {actor,cycle,events,getBuilding:()=>building,
    setBuilding:value=>{building=value;},setPath:value=>{path=value;},
    setGoal:value=>{goal=value;}};
}

{
  const f=repairFixture();
  assert(Object.isFrozen(f.cycle),'Repair cycle API is not mutable');
  f.actor.repairJob=null;
  assert.equal(f.cycle.tick(f.actor,.2),false,'Idle workers do not tick');
  assert.deepEqual(f.events,[]);
  f.actor.repairJob={buildingId:'house'};
  f.cycle.cancel(f.actor);
  assert.equal(f.actor.repairJob,null,'Explicit cancellation clears the job');
}
{
  for(const invalid of [null,{health:100},{clanId:'orcs'},{destroyed:true}]){
    const f=repairFixture();
    if(invalid)f.setBuilding({...f.getBuilding(),...invalid});
    else f.setBuilding(null);
    assert.equal(f.cycle.tick(f.actor,.1),false,'Invalid target cancels repair');
    assert.equal(f.actor.repairJob,null);
    assert.deepEqual(f.events,[['animation','Idle_Loop']]);
  }
}
{
  const f=repairFixture({position:2});
  assert.equal(f.cycle.tick(f.actor,.1),true,'Approach is active work');
  assert.deepEqual(f.events,[['navigate',0,.1,'engage']]);
  assert.equal(f.getBuilding().health,30,'Walking does not restore HP');
  f.setPath('arrived');
  assert.equal(f.cycle.tick(f.actor,.1),true);
  assert.deepEqual(f.events.slice(-2),[
    ['navigate',0,.1,'engage'],['animation','Idle_Loop']]);
  assert.equal(f.actor.repairJob.buildingId,'house','Arrival keeps the work order');
}
{
  for(const blocked of ['blocked','no-goal']){
    const f=repairFixture({position:3});
    if(blocked==='blocked')f.setPath('blocked');
    else f.setGoal(null);
    assert.equal(f.cycle.tick(f.actor,.1),false);
    assert.equal(f.actor.workerRetryTime,6,'Failed approach sets work retry');
    assert.equal(f.actor.repairJob,null,'Blocked order is cancelled');
    assert.deepEqual(f.events.slice(-2),[
      ['blocked'],['animation','Idle_Loop']]);
    assert.equal(f.getBuilding().health,30);
  }
}
{
  const f=repairFixture();
  assert.equal(f.cycle.tick(f.actor,.5),true);
  assert.equal(f.getBuilding().health,39,'Restoration is 18% of max HP per second');
  assert.equal(f.actor.workHitTimer,.5);
  assert.equal(f.events.filter(e=>e[0]==='hammer').length,0);
  assert.deepEqual(f.events.slice(0,3),[
    ['face','house'],['animation','Work_Swing'],['health',39]]);
  assert.equal(f.cycle.tick(f.actor,.5),true);
  assert.equal(f.getBuilding().health,48);
  assert.equal(f.actor.workHitTimer,0,'Swing cadence subtracts one duration');
  assert.deepEqual(f.events.filter(e=>e[0]==='hammer'),[['hammer',5]]);
  assert.equal(f.actor.repairJob.buildingId,'house');
}
{
  const f=repairFixture({health:99});
  assert.equal(f.cycle.tick(f.actor,.1),true);
  assert.equal(f.getBuilding().health,100,'Health never exceeds maximum');
  assert.equal(f.actor.repairJob,null,'Repaired buildings release the worker');
  assert.deepEqual(f.events.slice(-4),[
    ['health',100],['animation','Idle_Loop'],
    ['banner','BÂTIMENT RÉPARÉ'],['hud']]);
  assert.equal(f.cycle.tick(f.actor,.1),false,'Completion is not repeated');
  assert.equal(f.events.filter(e=>e[0]==='banner').length,1);
}
{
  const f=repairFixture({healthBar:false,clipDuration:.1});
  assert.equal(f.cycle.tick(f.actor,.34),true);
  assert.equal(f.events.filter(e=>e[0]==='hammer').length,0);
  assert.equal(f.cycle.tick(f.actor,.02),true);
  assert.deepEqual(f.events.filter(e=>e[0]==='hammer'),[['hammer',5]],
    'Short attack clips use the historical 350 ms minimum');
  assert.equal(f.events.filter(e=>e[0]==='health').length,0,
    'Absent health bars are never updated');
}
{
  const f=repairFixture();
  f.setBuilding({...f.getBuilding(),health:60});
  assert.equal(f.cycle.tick(f.actor,1),true);
  assert.equal(f.getBuilding().health,78,
    'The current target is resolved afresh after world replacement');
}
console.log('PASS repair: ownership, approach, blockage, swing cadence, health, completion and reset-safe lookup');
