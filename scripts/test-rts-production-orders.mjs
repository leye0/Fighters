import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {createProductionOrders}=require('../docs/rts-orders.js');

let gold={witch:500,orc:500},wood={witch:120,orc:120};
let arcanist=false,orcMage=false;
const calls=[];
const orders=createProductionOrders({
  roles:{profile:(faction,role)=>{
    calls.push([faction,role]);
    return {cost:role==='ranged'?80:50};
  }},
  trainingDuration:(_building,kind,role)=>kind==='witch'?5:role==='ranged'?9:7,
  upgradeCost:building=>building.level>=3?null:building.clanId==='witch'?230:160,
  arcanistUnlocked:()=>arcanist,
  canTrainOrcRole:role=>role!=='ranged'||orcMage,
  maxQueue:3,
  getGold:()=>gold,getWood:()=>wood
});
const building=(clanId,type,level=1)=>({clanId,type,level,
  destroyed:false,queue:[],progress:2.3});
const witch=building('witch','witch-house');
const orc=building('orcs','barrack');
const ready={running:true,paused:false};

assert.equal(orders.queue(witch,'witch','melee',{running:false,paused:false}),false);
assert.equal(orders.queue(witch,'witch','melee',{running:true,paused:true}),false);
assert.equal(orders.queue(witch,'orc','melee',ready),false);
assert.equal(orders.queue(orc,'witch','melee',ready),false);
assert.equal(orders.queue(witch,'witch','ranged',ready),false,'mage needs unlock');
assert.equal(orders.queue(orc,'orc','ranged',ready),false,'orc mage needs cauldron');
assert.equal(orders.queue(witch,'witch','melee',ready),true);
assert.deepEqual(witch.queue,[{kind:'witch',role:'melee',cost:50,woodCost:0,duration:5}]);
assert.deepEqual(calls,[['witch','melee']]);
assert.equal(gold.witch,450);
assert.equal(wood.witch,120);
arcanist=true;orcMage=true;
assert.equal(orders.queue(witch,'witch','ranged',ready),true);
assert.equal(orders.queue(orc,'orc','ranged',ready),true);
assert.equal(orc.queue[0].duration,9);
assert.equal(gold.orc,420);
assert.equal(orders.queue(witch,'upgrade','melee',ready),true);
assert.deepEqual(witch.queue[2],{kind:'upgrade',role:null,cost:230,woodCost:40,duration:8});
assert.equal(gold.witch,140);
assert.equal(wood.witch,80);
assert.equal(orders.queue(witch,'witch','melee',ready),false,'full queue');
assert.equal(orders.queue(building('neutral','witch-house'),'upgrade','melee',ready),false);
assert.equal(orders.queue(building('witch','mine'),'upgrade','melee',ready),false);
assert.equal(orders.queue({...building('witch','witch-house'),destroyed:true},'witch','melee',ready),false);
assert.equal(orders.queue(building('witch','witch-house',3),'upgrade','melee',ready),false,
  'level three has no upgrades');

assert.equal(orders.cancel(witch,1),true);
assert.equal(witch.progress,2.3,'cancelling a later order keeps the progress');
assert.equal(gold.witch,220);
assert.equal(orders.cancel(witch,0),true);
assert.equal(witch.progress,0,'cancelling first order resets progress');
assert.equal(gold.witch,270);
assert.equal(orders.cancel(witch,99),false);
assert.equal(orders.cancel(witch,0),true);
assert.equal(gold.witch,500);
assert.equal(wood.witch,120,'upgrade cancellation refunds wood');

// A new game rebinds both resource maps. Services must read the new objects.
gold={witch:300,orc:200};wood={witch:42,orc:30};
assert.equal(orders.queue(orc,'orc','melee',ready),true);
assert.equal(gold.orc,150);
assert.equal(orders.cancel(orc,1),true,'queue cancellation operates on current game');
assert.equal(gold.orc,200,'new order refunds against the current resource map');
assert.equal(orders.cancel(orc,0),true);
assert.equal(gold.orc,280);
assert.equal(wood.orc,30);

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersOrders.createProductionOrders('));
assert(game.includes('productionOrders.queue(building,kind,role,{running,paused})'));
assert(game.includes('productionOrders.cancel(building,index)'));
console.log('PASS production queues, training gates, refunds, upgrades and reset');
