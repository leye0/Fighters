import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../app/rts-unit-tick.js');

const calls=[];
let passiveKind=null,workStep=null,moveResult='moving',returnDefense=false;
const units=[];
const deps={
  units,getPassiveKind:()=>passiveKind,
  orcDirector:{enabled:true},witchDirector:{enabled:true},
  roles:{isWorker:actor=>actor.role==='worker',isFighter:actor=>actor.role!=='worker'},
  raiding:{retaliation:()=>null,end:actor=>{actor.raiding=false;calls.push('end raid');}},
  buildingContact:.78,
  cancelOrcFoodJob:actor=>{actor.orcFoodJob=null;calls.push('cancel food');},
  enemyOf:(actor,target)=>!!target&&!target.destroyed&&target.kind!==actor.kind,
  isBuilding:target=>!!target.hitbox,
  faceBuildingCenter:()=>calls.push('face building'),
  faceTarget:()=>calls.push('face target'),
  targetDistance:(actor,target)=>target.distance??0,
  dealDamage:(target,damage)=>{calls.push(['damage',target.id,damage]);},
  interceptMagicWithWall:(actor,target)=>target,
  playEffect:type=>calls.push(type),
  animation:(actor,name,force=false)=>calls.push(['animation',name,force]),
  tickRavenDistraction:()=>false,updateVillageDefense:()=>calls.push('defense'),
  nextRaidBuilding:()=>null,liveBuildings:()=>[],
  tickHealingRetreat:()=>false,tickSoulHarvester:()=>false,
  tickBerryForager:()=>false,tickOrcForager:()=>false,
  tickConstructWorker:()=>workStep==='construct',
  tickRepairWorker:()=>workStep==='repair',
  tickMineWorker:()=>workStep==='mine',
  tickTreeWorker:()=>workStep==='tree',
  tickWoodWorker:()=>workStep==='wood',
  tickGardenWorker:()=>workStep==='garden',
  navigateActor:(actor,destination,dt,mode)=>{
    calls.push(['navigate',mode]);return moveResult;
  },
  nearestHostile:()=>null,
  findSafeGoal:point=>point,
  returnFromDefense:()=>{returnDefense=true;},
  approachBuilding:()=>({x:1,z:2}),
  fireBolt:()=>calls.push('bolt'),rand:()=>.6
};
const tick=create(deps);
const makeActor=(role='melee')=>({
  kind:'witch',role,dead:false,deadTime:2,defenseTime:0,workerRetryTime:0,
  unreachableTime:0,approachAge:0,stun:0,cooldown:0,attack:null,
  attackOrder:null,destination:null,orcFoodJob:null,raiding:false,
  weapon:true,profile:{range:2,damage:18,sight:9},
  root:{position:{x:0,z:0}},clipCatalog:new Map([['Sword_Attack',{duration:.6}],
    ['Punch_Jab',{duration:.5}]])
});

// Dead units only perform cleanup; passive QA actors cannot advance.
const dead=makeActor();dead.dead=true;dead.orcFoodJob={};
tick(dead,.4);
assert.equal(dead.deadTime,1.6);
assert.equal(dead.orcFoodJob,null);
assert.deepEqual(calls,['cancel food']);
calls.length=0;
const passive=makeActor();passiveKind='witch';tick(passive,.5);
assert.equal(passive.approachAge,0);
assert.deepEqual(calls,[]);
passiveKind=null;

// An impact must land once and release its animation without becoming stuck.
const fighter=makeActor();const house={id:'house',kind:'orc',hitbox:{},distance:.7};
fighter.attackOrder=house;
tick(fighter,.05);
assert.equal(fighter.attack.target,house);
assert(calls.includes('swordSwing'));
calls.length=0;
tick(fighter,.25);
assert.deepEqual(calls.filter(call=>Array.isArray(call)&&call[0]==='damage'),
  [['damage','house',18]]);
tick(fighter,.5);
assert.equal(fighter.attack,null);
assert.equal(calls.filter(call=>Array.isArray(call)&&call[0]==='damage').length,1);

// A new fighter order must work after the current attack finishes.
const other={id:'other',kind:'orc',distance:0};
fighter.attackOrder=other;fighter.cooldown=0;calls.length=0;
tick(fighter,.05);
assert.equal(fighter.attack.target,other);
assert(calls.includes('face target'));

// Work dispatch is ordered. An assigned worker must not start an unrelated job.
const worker=makeActor('worker');worker.destination={x:5,z:3};
workStep='mine';calls.length=0;tick(worker,.1);
assert(!calls.some(call=>Array.isArray(call)&&call[0]==='navigate'));
workStep=null;moveResult='arrived';calls.length=0;tick(worker,.1);
assert.equal(worker.destination,null);
assert.deepEqual(calls.find(call=>Array.isArray(call)&&call[0]==='navigate'),
  ['navigate','order']);
moveResult='blocked';worker.destination={x:10,z:3};worker.navWatch={};
tick(worker,.1);
assert.equal(worker.destination,null);
assert.equal(worker.navWatch,null);

// A worker ignores enemies outside the immediate 3.5-unit danger radius.
const nearEdge=makeActor('worker');
const distantEnemy={...makeActor('melee'),kind:'orc',root:{position:{x:3.6,z:0}}};
units.push(nearEdge,distantEnemy);
workStep='mine';moveResult='moving';calls.length=0;
tick(nearEdge,.1);
assert.equal(nearEdge.fearTime||0,0,
  'Workers must keep working rather than flee enemies several steps away');
assert(!calls.some(c=>Array.isArray(c)&&c[0]==='navigate'));
distantEnemy.root.position.x=3.4;
nearEdge.fearScan=0;calls.length=0;
tick(nearEdge,.1);
assert(nearEdge.fearTime>0&&nearEdge.fearGoal,
  'A hostile fighter just inside the danger radius must trigger flight');
assert(calls.some(c=>Array.isArray(c)&&c[0]==='navigate'),
  'Flight must interrupt economic jobs at close range');
units.splice(0,2);

// A worker stops every economic task during danger, runs toward friendly
// fighters and resumes the original task when its fear expires.
const threatened=makeActor('worker'),guard=makeActor('melee');
guard.root.position={x:4,z:0};
const attacker={...makeActor('melee'),kind:'orc',root:{position:{x:2,z:1}}};
units.push(threatened,guard,attacker);
workStep='mine';moveResult='moving';calls.length=0;
tick(threatened,.1);
assert(threatened.fearTime>0&&threatened.fearGoal,
  'A nearby hostile fighter makes an economic unit retreat');
assert(threatened.fearGoal.x>guard.root.position.x,
  'The shelter must be beyond the friendly fighter, away from the attacker');
assert(calls.some(c=>Array.isArray(c)&&c[0]==='navigate'),
  'Retreat overrides mining even with an active work order');
attacker.dead=true;
for(let i=0;i<20;i++)tick(threatened,.1);
assert.equal(threatened.fearTime,0);
assert.equal(threatened.fearGoal,null);
calls.length=0;tick(threatened,.1);
assert(!calls.some(c=>Array.isArray(c)&&c[0]==='navigate'),
  'The interrupted mining task resumes after the threat is gone');
workStep=null;
units.splice(0,3);
moveResult='blocked';

// A blocked approach must clear an unreachable attack, including retaliation.
const blocked=makeActor();const farHouse={id:'far',kind:'orc',hitbox:{},distance:10};
blocked.attackOrder=farHouse;blocked.defenseAnchor={x:1,z:1};
units.push(blocked);
calls.length=0;tick(blocked,.1);
assert.equal(blocked.attackOrder,null);
assert.equal(blocked.unreachableTarget,farHouse);
assert.equal(blocked.unreachableTime,6);
assert.equal(returnDefense,true);

// The game must construct the ticker once and keep Three.js out of the module.
const integration=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(integration.includes('window.FightersUnitTick.create({'));
assert(html.includes('<script src="./rts-unit-tick.js"></script>'));
assert(!/THREE|document\.|window\./.test(readFileSync(
  new URL('../app/rts-unit-tick.js',import.meta.url),'utf8')));
console.log('PASS independent unit tick: death, impact, switching orders, worker dispatch and blocked paths');
