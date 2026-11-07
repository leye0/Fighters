import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-construction-worker-cycle.js');

function fixture(type='garden',{byAI=false,axis='x',kind='witch'}={}){
  const actor={id:3,kind,role:'worker',root:{position:{x:0,z:0}},
    route:{cached:true},approachCache:{cached:true},
    clipCatalog:new Map([['Sword_Attack',{duration:2}]])};
  const job={type,x:0,z:0,axis,byAI,cost:175,woodCost:25,
    site:{hitbox:{x:0,z:0}},progress:0,preview:{id:'preview'}};
  actor.constructJob=job;
  const pendingBuilds=[job],events=[];
  let gold={witch:100,orc:200},wood={witch:50,orc:75};
  let movement='moving',approach=true,built=true;
  const finish=(name,...args)=>{events.push(['built',name,...args]);return built;};
  const cycle=create({pendingBuilds,getGold:()=>gold,getWood:()=>wood,
    disposeConstructionPreview:job=>{job.preview=null;events.push(['dispose',job.type]);},
    updateConstructionPreview:job=>events.push(['preview',job.progress]),
    distanceToFootprint:(position,hitbox)=>
      Math.hypot(position.x-hitbox.x,position.z-hitbox.z),
    buildingContact:.78,
    approachBuilding:(actor,site)=>approach?{x:site.hitbox.x,z:site.hitbox.z}:null,
    navigateActor:(actor,goal,dt,mode)=>{
      events.push(['navigate',goal.x,goal.z,mode]);return movement;
    },markWorkBlocked:actor=>{actor.workerRetryTime=6;events.push(['blocked']);},
    animation:(actor,name)=>events.push(['animation',name]),
    faceDirection:(actor,x,z)=>events.push(['direction',x,z]),
    farmPlant:'Farm_Plant',
    faceBuildingCenter:(actor,site)=>events.push(['face building',site.hitbox.x]),
    workSwing:'Work_Swing',playEffect:(name,pos)=>events.push(['sound',name]),
    playConstructionHit:actor=>events.push(['hammer',actor.id]),
    buildSeconds:6,
    buildWitchHouse:(x,z,opts)=>finish('witch-house',x,z,opts),
    buildGarden:(x,z,opts)=>finish('garden',x,z,opts),
    buildStoneCircle:(x,z,opts)=>finish('stone-circle',x,z,opts),
    buildWall:(x,z,opts)=>finish('wall',x,z,opts),
    buildOrc:(type,x,z,opts)=>finish('orc',type,x,z,opts),
    showBanner:message=>events.push(['banner',message]),
    refreshHUD:()=>events.push(['hud'])});
  return {actor,job,pendingBuilds,events,cycle,
    getGold:()=>gold,getWood:()=>wood,
    resetTreasury:()=>{gold={witch:700,orc:800};wood={witch:300,orc:400};},
    setMovement:v=>{movement=v;},setApproach:v=>{approach=v;},
    setBuilt:v=>{built=v;}};
}

{
  const f=fixture();
  assert(Object.isFrozen(f.cycle));
  assert.equal(f.cycle.cancel({constructJob:null}),false);
  f.resetTreasury();
  assert.equal(f.cycle.cancel(f.actor),true);
  assert.equal(f.actor.constructJob,null);
  assert.equal(f.actor.route,null);
  assert.equal(f.actor.approachCache,null);
  assert.equal(f.pendingBuilds.length,0);
  assert.equal(f.job.preview,null,'Visual preview is released on cancellation');
  assert.equal(f.getGold().witch,875,'The current treasury receives the refund');
  assert.equal(f.getWood().witch,325);
  assert.equal(f.cycle.cancel(f.actor),false,'Repeated cancellation cannot double-refund');
  assert.equal(f.getGold().witch,875);
}

{
  for(const type of ['garden','stone-circle','wall']){
    const f=fixture(type);
    f.actor.root.position.x=2;
    assert.equal(f.cycle.tick(f.actor,.5),true,type);
    assert(f.events.some(e=>e[0]==='navigate'&&e[1]===0&&e[2]===0&&
      e[3]==='engage'),`${type} approaches the correct site`);
    assert.equal(f.job.progress,0,'Moving does not advance construction');
    assert.equal(f.pendingBuilds.length,1);
    assert.equal(f.events.filter(e=>e[0]==='preview').length,0);
  }
}

{
  const f=fixture('wall');f.actor.root.position.x=1.25;
  f.setMovement('blocked');
  assert.equal(f.cycle.tick(f.actor,.1),false);
  assert.equal(f.actor.constructJob,null,'Blocked work is cancelled');
  assert.equal(f.actor.workerRetryTime,6);
  assert.equal(f.getGold().witch,275,'Blocked work is refunded');
  assert.equal(f.getWood().witch,75);
  assert.deepEqual(f.events.slice(-2),[['dispose','wall'],['animation','Idle_Loop']]);
}

{
  const f=fixture('witch-house');f.actor.root.position.x=1.5;
  f.setApproach(false);
  assert.equal(f.cycle.tick(f.actor,.1),false);
  assert.equal(f.actor.workerRetryTime,6,'Unreachable perimeter is blocked');
  assert.equal(f.actor.constructJob,null);
  assert.equal(f.getGold().witch,275);
}

{
  const f=fixture('garden');
  assert.equal(f.cycle.tick(f.actor,.99),true);
  assert.equal(f.job.progress,.99);
  assert.equal(f.events.filter(e=>e[0]==='sound').length,0);
  f.cycle.tick(f.actor,.02);
  assert.deepEqual(f.events.filter(e=>e[0]==='sound'),[['sound','garden']],
    'Garden planting sound triggers at the historical 1-second threshold');
  f.cycle.tick(f.actor,.99);
  assert.equal(f.events.filter(e=>e[0]==='sound').length,2,
    'One effect per second of garden construction');
  assert(f.events.some(e=>e[0]==='direction'&&e[1]===.6&&e[2]===.8));
  assert(f.events.some(e=>e[0]==='animation'&&e[1]==='Farm_Plant'));
  assert.equal(f.events.filter(e=>e[0]==='preview').length,3);
  assert.equal(f.cycle.tick(f.actor,0),true);
  assert.equal(f.cycle.tick(f.actor,4),true);
  assert.equal(f.pendingBuilds.length,0);
  assert.equal(f.actor.constructJob,null);
  assert.equal(f.getGold().witch,100,'Completion must not refund prepaid costs');
  assert.equal(f.getWood().witch,50);
  assert.deepEqual(f.events.filter(e=>e[0]==='built'),
    [['built','garden',0,0,{prepaid:true}]]);
  assert.equal(f.events.filter(e=>e[0]==='hud').length,1);
  assert.equal(f.cycle.tick(f.actor,1),false,'Completed job cannot build twice');
}

{
  const f=fixture('hut',{byAI:true,kind:'orc'});
  f.cycle.tick(f.actor,.79);
  assert.equal(f.events.filter(e=>e[0]==='hammer').length,0);
  f.cycle.tick(f.actor,.02);
  assert.equal(f.events.filter(e=>e[0]==='hammer').length,1,
    'Hammer triggers after 40% of the sword animation');
  assert.equal(f.actor.workHitTimer,-1.19,'Original swing timer phase is preserved');
  f.cycle.tick(f.actor,5.19);
  assert.equal(f.actor.constructJob,null);
  assert.deepEqual(f.events.filter(e=>e[0]==='built'),
    [['built','orc','hut',0,0,{prepaid:true,byAI:true}]]);
  assert(f.events.some(e=>e[0]==='banner'&&e[1]==='CONSTRUCTION TERMINÉE'));
  assert.equal(f.events.filter(e=>e[0]==='hud').length,1);
}

{
  for(const [type,expected] of [
    ['witch-house',['witch-house',0,0,{prepaid:true}]],
    ['stone-circle',['stone-circle',0,0,{prepaid:true}]],
    ['wall',['wall',0,0,{prepaid:true,byAI:true,axis:'z'}]],
    ['barrack',['orc','barrack',0,0,{prepaid:true,byAI:true}]]
  ]){
    const f=fixture(type,{byAI:true,axis:'z'});
    f.cycle.tick(f.actor,6);
    assert.deepEqual(f.events.find(e=>e[0]==='built').slice(1),expected,
      `${type} dispatches the same builder and prepaid options`);
    assert.equal(f.getGold().witch,100);
    assert.equal(f.getWood().witch,50);
  }
}

{
  const f=fixture('wall',{kind:'orc',byAI:true});f.setBuilt(false);
  f.resetTreasury();
  f.cycle.tick(f.actor,6);
  assert.equal(f.actor.constructJob,null);
  assert.equal(f.getGold().orc,975,'Failed final placement refunds the active match');
  assert.equal(f.getWood().orc,425);
  assert.equal(f.events.filter(e=>e[0]==='banner').length,0,
    'Failed construction must not show successful completion');
  assert.equal(f.events.filter(e=>e[0]==='hud').length,1);
}

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersConstructionWorkerCycle.create('));
assert(game.includes('return constructionWorkerCycle.cancel(actor,refund)'));
assert(game.includes('return constructionWorkerCycle.tick(actor,dt)'));
assert(game.includes('getGold:()=>matchResources.gold,getWood:()=>matchResources.wood'));
console.log('PASS RTS construction workers: routes, planting, hammer, finish, refund and reset treasury.');
