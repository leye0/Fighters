import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {createProductionOrders,createProductionCompletions}=require('../docs/rts-orders.js');

let gold={witch:500,orc:500},wood={witch:120,orc:120};
let arcanist=false,orcMage=false;
const calls=[];
const live=[],completed=[];
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
  getGold:()=>gold,getWood:()=>wood,
  liveBuildings:()=>live,
  finishUpgrade:building=>completed.push(['upgrade',building]),
  finishTraining:(building,kind,role)=>completed.push(['train',building,kind,role])
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

// The fixed-step production runner completes at most one queued job per
// building per tick and retains the unused fractional progress.
const empty=building('neutral','mine');empty.progress=4;
witch.queue.push({kind:'witch',role:'worker',duration:5});
witch.progress=2;
orc.queue.push({kind:'upgrade',role:null,duration:8});
orc.progress=7.8;
live.push(witch,orc,empty);
orders.step(.1);
assert.equal(completed.length,0);
assert.equal(empty.progress,0,'idle production progress resets');
orders.step(.2);
assert.deepEqual(completed,[['upgrade',orc]]);
assert(Math.abs(orc.progress-.1)<1e-8);
assert.equal(orc.queue.length,0);
orders.step(2.7);
assert.deepEqual(completed.at(-1),['train',witch,'witch','worker']);
assert.equal(witch.queue.length,0);
assert(Math.abs(witch.progress)<1e-8);
orders.step(.5);
assert.equal(witch.progress,0,'no production order accumulates progress');

// Completion transitions are domain operations: no DOM, scene, GLB or voices
// are needed to verify their decisions and the historical callback order.
const events=[];
let blocked=false,witchPopulation=2;
const completedActors=[];
const completions=createProductionCompletions({
  safeSpawn:building=>{
    events.push(['safeSpawn',building.type]);
    return blocked?null:{x:4,z:8};
  },
  countActors:kind=>{events.push(['count',kind]);return witchPopulation;},
  spawnActor:(kind,position,index,role)=>{
    events.push(['spawn',kind,position.x,position.z,index,role]);
    const actor={};completedActors.push(actor);witchPopulation++;return actor;
  },
  resolveRally:point=>{events.push(['resolveRally',point.x]);return {x:point.x+1,z:0};},
  playCreationVoice:(kind,actor)=>events.push(['voice',kind,actor]),
  profile:(kind,role)=>{events.push(['profile',kind,role]);return {name:'Arcaniste'};},
  showBanner:message=>events.push(['banner',message]),
  witchHouseHealth:1500,
  orcLevelHealth:(type,level)=>{events.push(['levelHealth',type,level]);return level===2?2200:2900;},
  updateHealthBar:building=>events.push(['healthBar',building.health,building.level]),
  showOrcLevelModel:(building,level)=>events.push(['model',building.type,level]),
  refreshHUD:()=>events.push(['hud'])
});

blocked=true;
assert.equal(completions.finishTraining(witch,'witch','melee'),false);
assert.deepEqual(events,[['safeSpawn','witch-house'],['banner','SORTIE BLOQUÉE']],
  'blocked training consumes the queued order without spawning an actor');
events.length=0;blocked=false;
witch.rally={x:14,z:5};
assert.equal(completions.finishTraining(witch,'witch','ranged'),true);
assert.deepEqual(events,[
  ['safeSpawn','witch-house'],['count','witch'],['spawn','witch',4,8,2,'ranged'],
  ['resolveRally',14],['voice','witch',completedActors[0]],
  ['profile','witch','ranged'],['banner','ARCANISTE FORMÉ(E)']
]);
assert.deepEqual(completedActors[0].destination,{x:15,z:0});
events.length=0;
assert.equal(completions.finishTraining(orc,'orc','melee'),true);
assert.deepEqual(events,[
  ['safeSpawn','barrack'],['count','orc'],['spawn','orc',4,8,3,'melee'],
  ['voice','orc',completedActors[1]],['banner','ORC FORMÉ']
]);
assert.equal(completedActors[1].destination,undefined,'no rally stays unset');

// Reject ineligible upgrades without rendering, mutating health or showing HUD.
for(const invalid of [building('neutral','barrack'),building('witch','mine'),
  building('witch','garden'),building('witch','stone-circle'),building('witch','witch-house',3)]){
  invalid.health=700;invalid.maxHealth=900;
  events.length=0;
  assert.equal(completions.finishUpgrade(invalid),false);
  assert.equal(invalid.health,700);
  assert.equal(invalid.level,invalid.type==='witch-house'?3:1);
  assert.deepEqual(events,[]);
}

const house=building('witch','witch-house');
house.health=1200;house.maxHealth=1500;house.healthBar={};
events.length=0;
assert.equal(completions.finishUpgrade(house),true);
assert.equal(house.level,2);
assert.equal(house.maxHealth,2250);
assert.equal(house.health,1950,'upgrade preserves existing damage');
assert.deepEqual(events,[['healthBar',1950,2],['banner','AMÉLIORATION NIVEAU 2'],['hud']]);
house.health=2249;house.healthBar=null;
events.length=0;
assert.equal(completions.finishUpgrade(house),true);
assert.equal(house.maxHealth,3000);
assert.equal(house.health,2999,'health remains capped to the new maximum');
assert.deepEqual(events,[['banner','AMÉLIORATION NIVEAU 3'],['hud']]);

const barrack=building('orcs','barrack');
barrack.health=900;barrack.maxHealth=1200;barrack.healthBar={};
events.length=0;
assert.equal(completions.finishUpgrade(barrack),true);
assert.equal(barrack.level,2);
assert.equal(barrack.maxHealth,2200);
assert.equal(barrack.health,1900);
assert.deepEqual(events,[['levelHealth','barrack',2],['healthBar',1900,2],
  ['model','barrack',2],['banner','AMÉLIORATION NIVEAU 2'],['hud']]);

// A queue step removes the paid order before calling completion. No second
// payment or spontaneous refund is introduced by the extracted transition.
const endEvents=[];
const paid={witch:100,orc:100},timber={witch:40,orc:40};
const producer=building('witch','witch-house');
const finished=createProductionOrders({
  roles:{profile:()=>({cost:50})},trainingDuration:()=>1,upgradeCost:()=>60,
  arcanistUnlocked:()=>true,canTrainOrcRole:()=>true,maxQueue:8,
  getGold:()=>paid,getWood:()=>timber,liveBuildings:()=>[producer],
  finishTraining:(...args)=>{
    endEvents.push(['before',producer.queue.length,paid.witch]);
    completions.finishTraining(...args);
  },
  finishUpgrade:building=>completions.finishUpgrade(building)
});
assert.equal(finished.queue(producer,'witch','worker',ready),true);
assert.equal(paid.witch,50);
blocked=true;
finished.step(1);
assert.deepEqual(endEvents,[['before',0,50]]);
assert.equal(producer.queue.length,0);
assert.equal(paid.witch,50,'blocked exit does not create an implicit refund');

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersOrders.createProductionOrders('));
assert(game.includes('window.FightersOrders.createProductionCompletions('));
assert(game.includes('finishUpgrade:productionCompletions.finishUpgrade'));
assert(game.includes('finishTraining:productionCompletions.finishTraining'));
assert(!/function finish(?:Training|Upgrade)\(/.test(game),
  'production state transitions must not return to the rendering adapter');
assert(game.includes('productionOrders.queue(building,kind,role,{running,paused})'));
assert(game.includes('productionOrders.cancel(building,index)'));
assert(game.includes('productionOrders.step(dt)'));
console.log('PASS production queues, costs, completion transitions, event order and reset');
