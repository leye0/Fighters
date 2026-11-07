import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {createWorkerOrders}=require('../app/rts-orders.js');

const events=[];
const cancel=(name,property)=>actor=>{
  events.push([name,actor.id]);
  actor[property]=null;
};
const orders=createWorkerOrders({
  isWorker:actor=>actor.role==='worker',
  canRepair:(actor,b)=>actor.role==='worker'&&!actor.dead&&
    b?.clanId===(actor.kind==='witch'?'witch':'orcs')&&b.health<b.maxHealth,
  canMine:(actor,b)=>actor.role==='worker'&&b?.type==='mine'&&b.clanId==='neutral',
  cancelConstruction:cancel('construction','constructJob'),
  cancelWoodJob:cancel('wood','woodJob'),
  cancelRepair:cancel('repair','repairJob'),
  cancelFarmJob:cancel('farm','farmJob'),
  cancelSoulJob:cancel('soul','soulJob'),
  cancelFoodJob:cancel('food','orcFoodJob'),
  cancelMineJob:cancel('mine','mineJob')
});
function actor(id,kind='witch',role='worker'){
  return {id,kind,role,dead:false,workerRetryTime:0,
    constructJob:{},woodJob:{},repairJob:{},farmJob:{},mineJob:{},
    soulJob:{},orcFoodJob:{},treeJob:{},berryJob:{},healJob:{},
    route:{},approachCache:{},attackOrder:{},destination:{},
    routeVersion:4,routeAge:2,workHitTimer:8};
}
const a=actor('a'),b=actor('b','witch','melee');
const house={id:'house',clanId:'witch',health:50,maxHealth:100};
assert.equal(orders.repair([a,b],house),1);
assert.deepEqual(a.repairJob,{buildingId:'house'});
assert.equal(a.destination,null);
assert.equal(a.attackOrder,null);
assert.equal(a.workHitTimer,0);
assert.equal(a.routeVersion,-1);
assert.equal(a.routeAge,0);
assert.deepEqual(events.map(e=>e[0]),
  ['construction','wood','farm','soul','food','mine']);
assert.equal(orders.repair([actor('orc','orc')],house),0,'enemy house cannot be repaired');
const delayed=actor('delayed');delayed.workerRetryTime=3;
assert.equal(orders.repair([delayed],house,{byAI:true}),0,'AI respects worker retry');
assert.equal(orders.repair([delayed],house,{byAI:false}),1,'player repair ignores AI retry');

const mine={id:'mine',type:'mine',clanId:'neutral'};
const miner=actor('miner');
assert.equal(orders.mine([miner,b],mine),1);
assert.deepEqual(miner.mineJob,{mineId:'mine',phase:'extract',progress:0,cycles:0,amount:0});
assert.equal(miner.attackOrder!==null,true,'mining transition preserves previous attack field');
assert.equal(orders.mine([miner],{type:'hut'}),0,'only mines permit mining orders');

const logs={amount:12,reservedBy:null};
const logger=actor('logger'),other=actor('other');
assert.equal(orders.collectWood([logger,other],4,logs),1);
assert.equal(logs.reservedBy,'logger');
assert.deepEqual(logger.woodJob,{index:4,phase:'pickup',progress:0,amount:0,goal:null});
assert.equal(other.woodJob!==null,true,'one bundle does not assign a second worker');
assert.equal(orders.collectWood([other],4,logs),0,'reserved logs cannot be claimed twice');
assert.equal(orders.collectWood([other],4,null),0);

const chopper=actor('chopper');
assert.equal(orders.chop([chopper,b],7,{felled:false}),1);
assert.deepEqual(chopper.treeJob,{index:7,progress:0,goal:null});
assert.equal(orders.chop([chopper],7,{felled:true}),0,'felled tree cannot be chopped');

const farmer=actor('farmer');
const garden={id:'garden',type:'garden',destroyed:false};
assert.equal(orders.harvest([farmer,actor('enemy','orc'),b],garden),1);
assert.deepEqual(farmer.farmJob,
  {gardenId:'garden',plotIndex:-1,progress:0,phase:'harvest',amount:0});
assert.equal(orders.harvest([farmer],{...garden,destroyed:true}),0);

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersOrders.createWorkerOrders('));
for(const action of ['repair','mine','collectWood','chop','harvest'])
  assert(game.includes('workerOrders.'+action+'('),'missing runtime adapter '+action);
console.log('PASS worker repair, mining, wood collection, chopping and harvesting orders');
