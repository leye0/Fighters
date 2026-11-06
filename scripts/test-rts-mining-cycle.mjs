import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-mining-cycle.js');
const worker=(id,kind,x)=>({id,kind,role:'worker',dead:false,
  root:{position:{x,y:0,z:0}},route:{old:true},approachCache:{old:true}});
const building=(id,type,x,clanId='neutral',level=1)=>({id,type,clanId,level,
  destroyed:false,root:{position:{x,z:0}}});

function fixture(){
  const orc1=worker(1,'orc',0),orc2=worker(2,'orc',7),
    orc3=worker(3,'orc',8),orc4=worker(4,'orc',9),witch=worker(5,'witch',3);
  const mine1=building(11,'mine',0,'neutral',2);
  const mine2=building(12,'mine',6);
  const barrack=building(13,'barrack',20,'orcs');
  const witchHouse=building(14,'witch-house',20,'witch');
  const units=[orc1,orc2,orc3,orc4,witch];
  const buildingInstances=new Map([mine1,mine2,barrack,witchHouse].map(b=>[b.id,b]));
  const events=[];
  const enabled={orc:true,witch:true};
  let running=true,explored=true,navResult='moving',approach=true;
  let treasury={orc:0,witch:0};
  const distance=(actor,b)=>Math.abs(actor.root.position.x-b.root.position.x);
  const cycle=create({units,buildingInstances,roles:{isWorker:u=>u.role==='worker'},
    fogOfWar:{exploredAt:(x,z,clan)=>{
      assert.equal(clan,'witch');return explored;
    }},isRunning:()=>running,directorEnabled:clan=>enabled[clan],
    targetDistance:distance,acknowledgeOrcAiOrder:actors=>
      events.push(['ack',actors.map(u=>u.id)]),
    unitFaction:u=>u.kind==='witch'?'witch':'orcs',
    liveBuildings:()=>[...buildingInstances.values()].filter(b=>!b.destroyed),
    woodStoreFor:()=>null,buildingContact:1,
    approachBuilding:(actor,b)=>approach?b.root.position:null,
    navigateActor:(actor,to,dt,mode)=>{
      events.push(['navigate',actor.id,to.x,mode]);return navResult;
    },markWorkBlocked:actor=>events.push(['blocked',actor.id]),
    animation:(actor,clip)=>events.push(['animation',actor.id,clip]),
    faceBuildingCenter:(actor,b)=>events.push(['face',actor.id,b.id]),
    workSwing:'Work_Swing',playEffect:(name,pos)=>events.push(['sound',name,pos]),
    mountCarriedGold:actor=>{
      actor.carryGold={visible:true};events.push(['cargo',actor.id]);
    },hideCarriedGold:actor=>{
      if(actor.carryGold)actor.carryGold.visible=false;
    },creditGold:(actor,amount)=>{
      treasury[actor.kind]+=amount;events.push(['credit',actor.id,amount]);
    },refreshHUD:()=>events.push(['hud'])});
  return {cycle,units,orc1,orc2,orc3,orc4,witch,mine1,mine2,barrack,
    witchHouse,buildingInstances,events,enabled,
    setRunning:value=>{running=value;},setExplored:value=>{explored=value;},
    setNavigation:value=>{navResult=value;},setApproach:value=>{approach=value;},
    treasury:()=>treasury,newTreasury:()=>{treasury={orc:0,witch:0};}};
}

{
  const f=fixture();
  assert(Object.isFrozen(f.cycle));
  f.setRunning(false);f.cycle.assign();
  assert.equal(f.orc1.mineJob,undefined,'Paused games cannot assign miners');
  f.setRunning(true);f.enabled.orc=false;f.cycle.assign();
  assert.equal(f.orc1.mineJob,undefined,'Disabled AI cannot assign miners');
  f.enabled.orc=true;f.cycle.assign();
  assert.equal(f.orc1.mineJob.mineId,f.mine1.id,'Nearest available miner first');
  assert.equal(f.orc2.mineJob,undefined,'Four workers permit only one auto-miner');
  assert.deepEqual(f.events.filter(e=>e[0]==='ack'),[['ack',[f.orc1.id]]]);
  assert.equal(f.orc1.route,null);
  assert.equal(f.orc1.approachCache,null);
  f.cycle.assign();
  assert.equal(f.events.filter(e=>e[0]==='ack').length,1,
    'Existing assignments do not duplicate AI acknowledgments');
  f.mine1.destroyed=true;f.orc1.carryGold={visible:true};
  f.cycle.assign();
  assert.equal(f.orc1.mineJob,null,'Invalidated mines cancel previous work');
  assert.equal(f.orc1.carryGold.visible,false,'Cancellation hides carried ore');
  assert.equal(f.orc2.mineJob.mineId,f.mine2.id,'Reassign remaining valid mine');
}

{
  const f=fixture();
  f.setExplored(false);f.cycle.assign('witch');
  assert.equal(f.witch.mineJob,undefined,'Witch AI never mines unexplored deposits');
  f.setExplored(true);f.cycle.assign('witch');
  assert.equal(f.witch.mineJob.mineId,f.mine1.id);
  assert.equal(f.events.filter(e=>e[0]==='ack').length,0,
    'Only Orc AI announces the order');
  f.witch.destination={x:4};f.cycle.cancel(f.witch);
  f.cycle.assign('witch');
  assert.equal(f.witch.mineJob,null,'Active movement prevents autonomous reassignment');
}

{
  const f=fixture();
  f.cycle.assign();
  const miner=f.orc1,job=miner.mineJob;
  assert.equal(f.cycle.tick(miner,4.49),true);
  assert.equal(job.phase,'extract');
  assert.equal(f.treasury().orc,0);
  assert(f.events.some(e=>e[0]==='sound'&&e[1]==='mine'));
  assert.equal(f.cycle.tick(miner,.01),true);
  assert.equal(job.phase,'carry');
  assert.equal(job.amount,120,'Ore payout preserves 60 gold per mine level');
  assert.equal(job.progress,0);
  assert.equal(miner.carryGold.visible,true);
  assert.equal(f.treasury().orc,0,'Extracting does not credit the treasury');
  assert.equal(f.cycle.tick(miner,.1),true);
  assert(f.events.some(e=>e[0]==='navigate'&&e[3]==='engage'));
  assert.equal(f.treasury().orc,0,'Transport remains unpaid');
  f.newTreasury();
  miner.root.position.x=f.barrack.root.position.x;
  assert.equal(f.cycle.tick(miner,.1),true);
  assert.equal(f.treasury().orc,120,
    'Delivery credits the current match treasury, not an obsolete reference');
  assert.equal(job.amount,0);
  assert.equal(job.phase,'extract');
  assert.equal(job.cycles,1);
  assert.equal(miner.carryGold.visible,false);
  assert.equal(miner.route,null);
  assert.equal(miner.approachCache,null);
  assert(f.events.some(e=>e[0]==='hud'));
  assert.equal(f.cycle.tick(f.orc3,.1),false,'Workers without mining tasks are ignored');
}

{
  const f=fixture();
  f.cycle.assign();
  const miner=f.orc1;
  miner.root.position.x=7;
  f.setNavigation('blocked');
  assert.equal(f.cycle.tick(miner,.1),false);
  assert.equal(miner.mineJob,null,'Blocked extraction aborts the task');
  assert(f.events.some(e=>e[0]==='blocked'));
  f.cycle.assign();
  miner.root.position.x=0;
  miner.mineJob.phase='carry';miner.mineJob.amount=120;
  miner.root.position.x=7;
  assert.equal(f.cycle.tick(miner,.1),true,'Blocked return trip retries instead of discarding ore');
  assert.equal(miner.mineJob.retryWait,5);
  assert.equal(f.treasury().orc,0);
  assert.equal(f.cycle.tick(miner,1),true);
  assert.equal(miner.mineJob.retryWait,4);
  f.setNavigation('moving');f.setApproach(false);
  miner.mineJob.retryWait=0;
  assert.equal(f.cycle.tick(miner,.1),true);
  assert.equal(miner.mineJob.retryWait,5,'Missing return approach also retries');
  f.mine1.destroyed=true;
  miner.mineJob.retryWait=0;
  assert.equal(f.cycle.tick(miner,.1),false,'Destroyed mines cancel carrying workers');
  assert.equal(miner.mineJob,null);
  assert.equal(f.treasury().orc,0);
}

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersMiningCycle.create('));
assert(game.includes('return miningCycle.assign(clan)'));
assert(game.includes('return miningCycle.tick(actor,dt)'));
assert(game.includes('return miningCycle.cancel(actor)'));
assert(!game.includes('const MINING_SECONDS='),
  'The extracted mining timer must be owned by rts-mining-cycle.js');
console.log('PASS mining cycle: AI, fog, extraction, delivery, reset resources, cancellation and retries.');
