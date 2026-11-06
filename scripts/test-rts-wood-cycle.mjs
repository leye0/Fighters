import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-wood-cycle.js');
const worker=(id,kind,x)=>({id,kind,role:'worker',dead:false,
  root:{position:{x,z:0}},route:{old:true}});
const tree=(x,felled=false)=>({x,z:0,radius:.4,felled});
const building=(id,type,clanId,x)=>({id,type,clanId,destroyed:false,
  root:{position:{x,z:0}},hitbox:{x}});

function fixture(){
  const orc=worker(1,'orc',0),orc2=worker(2,'orc',5),witch=worker(3,'witch',18);
  const units=[orc,orc2,witch];
  const forestLayout=[tree(0),tree(18),tree(22,true)];
  const woodDeposits=new Map([[2,{amount:35,reservedBy:null}]]);
  const buildings=[building(11,'barrack','orcs',7),
    building(12,'witch-house','witch',24)];
  const knownEnemyBuildings={witch:new Set()};
  const events=[];
  const enabled={orc:true,witch:true};
  let explored=true,navResult='moving',clear=true,goal=true;
  let wood={orc:0,witch:0};
  const distance=(actor,b)=>Math.abs(actor.root.position.x-b.root.position.x);
  const cycle=create({units,forestLayout,woodDeposits,roles:{isWorker:u=>u.role==='worker'},
    fogOfWar:{exploredAt:()=>explored},orcAiEnabled:()=>enabled.orc,
    witchAiEnabled:()=>enabled.witch,getWood:clan=>wood[clan],
    knownEnemyBuildings,enemySpawn:{x:0,z:0},
    distanceToFootprint:(t,b)=>Math.abs(t.x-b.x),
    liveBuildings:()=>buildings.filter(b=>!b.destroyed),targetDistance:distance,
    navigatorRTS:{pointClear:()=>clear,segmentClear:()=>goal,plan:()=>goal?[]:null},
    unitRadius:.4,buildingContact:1,
    orderChop:(actors,index,options)=>{
      events.push(['order chop',actors[0].id,index,options?.byAI??false]);
      if(forestLayout[index].felled)return false;
      actors[0].treeJob={index,progress:0,goal:null};return true;
    },orderCollectWood:(actors,index,options)=>{
      events.push(['order wood',actors[0].id,index,options?.byAI??false]);
      const deposit=woodDeposits.get(index);
      if(!deposit||deposit.reservedBy)return false;
      deposit.reservedBy=actors[0].id;
      actors[0].woodJob={index,phase:'pickup',progress:0,amount:0,goal:null};
      return true;
    },placeLogBundle:index=>events.push(['place',index]),
    removeLogBundle:index=>events.push(['remove',index]),
    mountCarriedWood:actor=>{actor.carryBundle={visible:true};events.push(['cargo',actor.id]);},
    hideCarriedWood:actor=>{
      if(actor.carryBundle)actor.carryBundle.visible=false;
    },creditWood:(actor,amount)=>{wood[actor.kind]+=amount;events.push(['credit',actor.id,amount]);},
    animation:(actor,clip)=>events.push(['animation',actor.id,clip]),
    faceDirection:(actor,dx,dz)=>events.push(['face',actor.id,dx,dz]),
    markWorkBlocked:actor=>events.push(['blocked',actor.id]),
    navigateActor:(actor,to,dt,mode)=>{
      events.push(['navigate',actor.id,to.x,mode]);return navResult;
    },approachBuilding:(actor,b)=>clear?b.root.position:null,
    fellTree:index=>{
      forestLayout[index].felled=true;
      woodDeposits.set(index,{amount:40,reservedBy:null});
      events.push(['fell',index]);
    },showBanner:message=>events.push(['banner',message]),
    refreshHUD:()=>events.push(['hud']),farmHarvest:'Farm_Harvest',treeChop:'Tree_Chop'});
  return {cycle,orc,orc2,witch,units,forestLayout,woodDeposits,buildings,
    knownEnemyBuildings,events,enabled,wood:()=>wood,
    setWood:(kind,amount)=>{wood[kind]=amount;},newWood:()=>{wood={orc:0,witch:0};},
    setExplored:value=>{explored=value;},setNavigation:value=>{navResult=value;},
    setClear:value=>{clear=value;},setGoal:value=>{goal=value;}};
}

{
  const f=fixture();
  assert(Object.isFrozen(f.cycle));
  f.enabled.orc=false;f.cycle.assignOrcLumberjack();
  assert.equal(f.orc.treeJob,undefined);
  f.enabled.orc=true;f.setWood('orc',140);f.cycle.assignOrcLumberjack();
  assert.equal(f.orc.treeJob,undefined,'Enough wood suppresses Orc auto-chopping');
  f.setWood('orc',139);f.setExplored(false);f.cycle.assignOrcLumberjack();
  assert.equal(f.orc.treeJob,undefined,'Orc AI cannot cut unexplored trees');
  f.setExplored(true);f.cycle.assignOrcLumberjack();
  assert.equal(f.orc.treeJob.index,0,'Orc chooses nearest eligible trunk');
  assert(f.events.some(e=>e[0]==='order chop'&&e[1]===f.orc.id));
  f.cycle.assignOrcLumberjack();
  assert.equal(f.events.filter(e=>e[0]==='order chop').length,1,
    'One active logging worker blocks duplicate auto-assignments');
}

{
  const f=fixture();
  f.setExplored(false);f.cycle.assignWitchLumberjack();
  assert.equal(f.witch.treeJob,undefined,'Witches cannot see undiscovered trunks');
  f.setExplored(true);
  const hostile=building(20,'barrack','orcs',18);
  f.buildings.push(hostile);f.knownEnemyBuildings.witch.add(hostile.id);
  f.cycle.assignWitchLumberjack();
  assert.equal(f.witch.treeJob,undefined,'Known Orc buildings exclude nearby woods');
  f.knownEnemyBuildings.witch.clear();
  f.cycle.assignWitchLumberjack();
  assert.equal(f.witch.treeJob.index,1,'Witches avoid undiscovered Orc village');
  assert(f.events.some(e=>e[0]==='order chop'&&e[1]===f.witch.id&&e[3]===true));
  f.witch.treeJob=null;f.setWood('witch',180);
  f.cycle.assignWitchLumberjack();
  assert.equal(f.witch.treeJob,null,'Witch threshold preserves wood reserve');
  f.setWood('witch',0);f.witch.mineJob={mineId:1};
  f.cycle.assignWitchLumberjack();
  assert.equal(f.witch.treeJob,null,'Miners are not stolen by automatic chopping');
}

{
  const f=fixture();f.cycle.assignOrcLumberjack();
  assert.equal(f.cycle.tickTree(f.orc,4.19),true);
  assert.equal(f.forestLayout[0].felled,false);
  assert.equal(f.cycle.tickTree(f.orc,.01),true);
  assert.equal(f.forestLayout[0].felled,true,'Tree falls only after 4.2 seconds');
  assert.equal(f.orc.treeJob,null);
  assert.equal(f.orc.woodJob.phase,'pickup','Cutting schedules physical pickup');
  assert.equal(f.woodDeposits.get(0).reservedBy,f.orc.id);
  assert(f.events.some(e=>e[0]==='order wood'&&e[3]===true));
  assert.equal(f.cycle.tickWood(f.orc,1.14),true);
  assert.equal(f.orc.woodJob.phase,'pickup');
  assert.equal(f.cycle.tickWood(f.orc,.01),true);
  assert.equal(f.orc.woodJob.phase,'carry');
  assert.equal(f.orc.woodJob.amount,40);
  assert.equal(f.woodDeposits.has(0),false,'Picked bundles leave the world');
  assert.equal(f.orc.carryBundle.visible,true);
  assert.equal(f.wood().orc,0,'Wood is not credited before delivery');
  assert.equal(f.cycle.tickWood(f.orc,.1),true);
  assert(f.events.some(e=>e[0]==='navigate'&&e[3]==='engage'));
  assert.equal(f.wood().orc,0);
  f.newWood();f.orc.root.position.x=7;
  assert.equal(f.cycle.tickWood(f.orc,.1),true);
  assert.equal(f.wood().orc,40,'The new match treasury receives the delivery');
  assert.equal(f.orc.woodJob,null);
  assert.equal(f.orc.carryBundle.visible,false);
  assert(f.events.some(e=>e[0]==='banner'&&e[1].startsWith('BOIS LIVRÉ')));
  assert.equal(f.cycle.tickTree(f.orc,.1),false);
  assert.equal(f.cycle.tickWood(f.orc,.1),false);
}

{
  const f=fixture();f.forestLayout[0].felled=true;
  f.woodDeposits.set(0,{amount:32,reservedBy:f.orc.id});
  f.orc.woodJob={index:0,phase:'pickup',progress:0,amount:0};
  f.cycle.cancel(f.orc);
  assert.equal(f.orc.woodJob,null);
  assert.equal(f.woodDeposits.get(0).reservedBy,null,
    'Cancelled pickup releases the original reservation');
  f.orc.woodJob={index:0,phase:'carry',amount:32};
  f.orc.carryBundle={visible:true};f.woodDeposits.delete(0);
  f.cycle.cancel(f.orc);
  assert.deepEqual(f.woodDeposits.get(0),{amount:32,reservedBy:null},
    'Cancelled transport restores exactly the original amount');
  assert.equal(f.orc.carryBundle.visible,false);
  assert(f.events.some(e=>e[0]==='place'&&e[1]===0));
  assert.equal(f.wood().orc,0);
}

{
  const f=fixture();f.forestLayout[0].felled=true;
  f.woodDeposits.set(0,{amount:30,reservedBy:f.orc.id});
  f.orc.woodJob={index:0,phase:'pickup',progress:0,amount:0,goal:null};
  f.orc.root.position.x=8;f.setNavigation('blocked');
  assert.equal(f.cycle.tickWood(f.orc,.1),false);
  assert.equal(f.orc.woodJob,null);
  assert.equal(f.woodDeposits.get(0).reservedBy,null);
  assert(f.events.some(e=>e[0]==='blocked'));
  f.orc.woodJob={index:0,phase:'carry',amount:30};
  f.orc.root.position.x=15;
  assert.equal(f.cycle.tickWood(f.orc,.1),true);
  assert.equal(f.orc.woodJob.retryWait,5,'Return paths retry without losing wood');
  assert.equal(f.cycle.tickWood(f.orc,1),true);
  assert.equal(f.orc.woodJob.retryWait,4);
  f.orc.treeJob={index:1,progress:0,goal:null};
  f.orc.woodJob=null;f.setGoal(false);f.setClear(false);
  assert.equal(f.cycle.tickTree(f.orc,.1),true);
  assert.equal(f.orc.treeJob,null,'Unreachable trunk aborts without falling');
  assert.equal(f.forestLayout[1].felled,false);
}

{
  const f=fixture();
  f.witch.root.position.x=24;
  f.witch.woodJob={index:1,phase:'carry',amount:30};
  f.forestLayout[1].felled=true;
  assert.equal(f.cycle.tickWood(f.witch,.1),true);
  assert.equal(f.wood().witch,30);
  assert.equal(f.witch.woodJob.index,2,
    'After delivery Witches reserve another safe fallen bundle first');
  assert(f.events.some(e=>e[0]==='order wood'&&e[1]===f.witch.id&&e[3]===true));
  f.cycle.cancel(f.witch);
  f.setWood('witch',205);f.witch.woodJob={index:1,phase:'carry',amount:20};
  f.cycle.tickWood(f.witch,.1);
  assert.equal(f.wood().witch,225);
  assert.equal(f.witch.woodJob,null,
    'The post-delivery reserve threshold suppresses further auto-gathering');
}

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersWoodCycle.create('));
for(const adapter of ['cancelWoodJob(actor){return woodCycle.cancel(actor)',
  'return woodCycle.storeFor(actor)','return woodCycle.tickWood(actor,dt)',
  'return woodCycle.assignOrcLumberjack()','return woodCycle.assignWitchLumberjack()',
  'return woodCycle.tickTree(actor,dt)'])assert(game.includes(adapter),adapter);
assert(game.includes('cancelConstruction,cancelWoodJob,cancelRepair,cancelFarmJob'),
  'The early worker-order service must preserve its wood cancellation adapter');
assert(!game.includes('const TREE_CHOP_SECONDS='));
console.log('PASS wood cycle: logging, fog, safe groves, pickup, delivery, cancellation and retries.');
