import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const observations=require('../app/rts-ai-observations.js');

const unit=(kind,id,x,z,role='melee')=>({
  kind,id,root:{position:{x,z}},role,health:70,maxHealth:100,dead:false,
  attackOrder:null,raiding:false,mineJob:null,scouting:false,destination:null,
  orcFoodJob:null,repairJob:null,healJob:null
});
const orc=unit('orc',1,2,3);
const hiddenOrc=unit('orc',2,7,9);
const witch=unit('witch',3,4,5,'worker');
const hiddenWitch=unit('witch',4,9,8,'healer');
const deadWitch=unit('witch',5,4,5);deadWitch.dead=true;
const deadOrc=unit('orc',6,2,3);deadOrc.dead=true;
const all=[orc,hiddenOrc,witch,hiddenWitch,deadWitch,deadOrc];
const orcBuilding={
  id:11,clanId:'orcs',type:'barrack',level:2,queue:[{kind:'melee',extra:5}],
  health:90,maxHealth:120,hitbox:{width:2},destroyed:false,wallAxis:'x',
  root:{position:{x:12,z:18}}
};
const destroyedOrcBuilding={...orcBuilding,id:12,destroyed:true};
const witchBuilding={...orcBuilding,id:13,clanId:'witch',type:'house'};
const buildingInstances=new Map([
  [11,orcBuilding],[12,destroyedOrcBuilding],[13,witchBuilding]
]);
const fogCalls=[];
const fogOfWar={
  exploredAt(x,z,clan){fogCalls.push(['explored',x,z,clan]);return x<8;},
  visibleAt(x,z,clan){fogCalls.push(['visible',x,z,clan]);return x<6;}
};

let cap=15;
const orcArgs={
  running:true,paused:false,gold:50,wood:25,buildingInstances,
  aliveOrcs:[orc,hiddenOrc],units:all,fogOfWar,enemyBaseKnown:false,
  scoutTarget:{x:10,z:11},unitCap:()=>cap,
  populationCommitted:()=>5,cauldronAvailable:()=>true
};
const orcState=observations.orc(orcArgs);
assert.deepEqual(Object.keys(orcState),[
  'ready','running','paused','gold','wood','buildings','orcs','witches',
  'enemyBaseKnown','scoutTarget','unitCap','populationCommitted','cauldronAvailable'
]);
assert.deepEqual(orcState.buildings,[{
  id:11,type:'barrack',level:2,queue:[{kind:'melee'}],health:90,
  maxHealth:120,hitbox:orcBuilding.hitbox,destroyed:false,x:12,z:18,axis:'x'
}]);
assert.deepEqual(orcState.orcs,[
  {id:1,x:2,z:3,health:70,maxHealth:100,dead:false,role:'melee',
   attackOrder:false,mining:false,scouting:false,destination:false,foraging:false},
  {id:2,x:7,z:9,health:70,maxHealth:100,dead:false,role:'melee',
   attackOrder:false,mining:false,scouting:false,destination:false,foraging:false}
]);
assert.deepEqual(orcState.witches,[
  {id:3,x:4,z:5,role:'worker',dead:false}
]);
assert.equal(orcState.cauldronAvailable,true);
assert.deepEqual(fogCalls,[['explored',4,5,'orc'],['explored',9,8,'orc']]);

const witchArgs={
  running:true,paused:false,gold:90,wood:40,food:15,homeId:13,
  circleUnlocked:()=>true,arcanistUnlocked:()=>false,
  pendingBuilds:[{type:'garden'},{type:'barrack'}],
  buildFaction:type=>type==='garden'?'witch':'orcs',
  buildings:[witchBuilding],aliveWitches:[witch,hiddenWitch],
  units:all,fogOfWar,enemyTarget:orcBuilding,scoutTarget:{x:1,z:1}
};
fogCalls.length=0;
const witchState=observations.witch(witchArgs);
assert.deepEqual(Object.keys(witchState),[
  'ready','running','paused','gold','wood','food','homeId','circleUnlocked',
  'arcanistUnlocked','pendingBuilds','buildings','witches','orcs',
  'enemyTarget','scoutTarget','unitCap'
]);
assert.deepEqual(witchState.pendingBuilds,[{type:'garden'}]);
assert.deepEqual(witchState.buildings,[{
  id:13,type:'house',level:2,queue:[{kind:'melee'}],health:90,
  maxHealth:120,hitbox:witchBuilding.hitbox,destroyed:false
}]);
assert.deepEqual(witchState.orcs,[{id:1,x:2,z:3,role:'melee'}]);
assert.deepEqual(witchState.witches.map(u=>u.id),[3,4]);
assert.equal(witchState.witches[0].repairing,false);
assert.equal(witchState.witches[0].healing,false);
assert.deepEqual(witchState.enemyTarget,{id:11});
assert.equal(witchState.unitCap,17);
assert.deepEqual(fogCalls,[['visible',2,3,'witch'],['visible',7,9,'witch']]);

// Observations capture scalar values as of the tick, but never pass the live
// arrays, production queues, or unit objects through to strategy directors.
orc.health=30;orc.scouting=true;orc.attackOrder={id:13};
orcArgs.gold=20;cap=16;
const nextOrcState=observations.orc(orcArgs);
assert.equal(orcState.gold,50);
assert.equal(nextOrcState.gold,20);
assert.equal(orcState.unitCap,15);
assert.equal(nextOrcState.unitCap,16);
assert.equal(orcState.orcs[0].health,70);
assert.equal(nextOrcState.orcs[0].health,30);
assert.equal(nextOrcState.orcs[0].attackOrder,true);
assert.notStrictEqual(nextOrcState.orcs[0],orc);
assert.notStrictEqual(nextOrcState.buildings[0].queue,orcBuilding.queue);
assert.notStrictEqual(nextOrcState.buildings[0].queue[0],orcBuilding.queue[0]);
assert.equal(observations.witch({...witchArgs,enemyTarget:null}).enemyTarget,null);

console.log('PASS AI observations: exact contracts, fog isolation, live-to-snapshot values, and queues.');
