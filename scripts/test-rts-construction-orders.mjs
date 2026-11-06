import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {createConstructionOrders}=require('../docs/rts-orders.js');

const actor=(id,kind='witch',x=0,z=0)=>({id,kind,role:'worker',dead:false,
  root:{position:{x,z}},constructJob:null,repairJob:null,workerRetryTime:0,
  treeJob:{},berryJob:{},destination:{},attackOrder:{},route:{},
  approachCache:{},workHitTimer:4});
const near=actor('near','witch',1,1),selectedWorker=actor('selected','witch',10,10);
const orc=actor('orc','orc',4,4);
const units=[near,selectedWorker,orc],selected=new Set([selectedWorker]);
const pendingBuilds=[],events=[];
let gold={witch:200,orc:250},wood={witch:100,orc:150},creates=0;
const orders=createConstructionOrders({
  units,selected,isWorker:u=>u.role==='worker',pendingBuilds,
  getGold:()=>gold,getWood:()=>wood,
  cancelWoodJob:u=>{u.woodJob=null;events.push(['wood',u.id]);},
  cancelRepair:u=>{u.repairJob=null;events.push(['repair',u.id]);},
  cancelMineJob:u=>{u.mineJob=null;events.push(['mine',u.id]);},
  cancelFarmJob:u=>{u.farmJob=null;events.push(['farm',u.id]);},
  acknowledgeOrcAiOrder:workers=>events.push(['orc-ack',workers[0].id]),
  acknowledgePlayerOrder:workers=>events.push(['player-ack',workers[0].id])
});
const createJob=worker=>{creates++;return {type:'garden',workerId:worker.id,cost:70,woodCost:20};};
assert.equal(orders.assign({clan:'witch',x:1,z:1,cost:70,woodCost:20,createJob}),true);
assert.equal(selectedWorker.constructJob.workerId,'selected',
  'player-selected builder wins over a closer unselected worker');
assert.equal(near.constructJob,null);
assert.equal(selectedWorker.destination,null);
assert.equal(selectedWorker.attackOrder,null);
assert.equal(selectedWorker.workHitTimer,0);
assert.equal(gold.witch,130);
assert.equal(wood.witch,80);
assert.equal(pendingBuilds.length,1);
assert.deepEqual(events.slice(-1),[['player-ack','selected']]);

const retrying=actor('retrying','orc',3,3);retrying.repairJob={};retrying.workerRetryTime=2;
units.push(retrying);
assert.equal(orders.assign({clan:'orc',x:3,z:3,cost:45,woodCost:11,byAI:true,createJob}),true);
assert.equal(orc.constructJob.workerId,'orc','AI must skip repairing/retrying workers');
assert.deepEqual(events.at(-1),['orc-ack','orc']);
assert.equal(gold.orc,205);
assert.equal(wood.orc,139);

// The game reassigns its resource objects on reset; orders must always access
// the current economy, not the object that existed during boot.
gold={witch:900,orc:900};wood={witch:900,orc:900};
assert.equal(orders.assign({clan:'witch',x:1,z:1,cost:50,woodCost:10,
  byAI:true,createJob}),true);
assert.equal(near.constructJob.workerId,'near');
assert.equal(gold.witch,850);
assert.equal(wood.witch,890);
assert.equal(events.at(-1)[0],'farm','Witch AI does not play a player voice');
assert.equal(creates,3,'create a visual site only when an eligible worker exists');
assert.equal(orders.assign({clan:'witch',x:1,z:1,cost:50,woodCost:10,
  createJob}),false,'busy workers cannot be assigned twice');
assert.equal(creates,3);

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersOrders.createConstructionOrders('));
assert(game.includes('constructionOrders.assign({clan,x,z,cost,woodCost,byAI,'));
console.log('PASS construction assignment, resource payment, worker priority and reset');
