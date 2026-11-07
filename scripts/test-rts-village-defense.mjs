#!/usr/bin/env node
/** Reactive defense rules, callback order and boundary values without WebGL. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-village-defense.js');

function unit(kind,id,x=0,z=0,role='melee'){
  return {kind,id,role,dead:false,raiding:false,root:{position:{x,z}},
    defenseTime:0,defenseAnchor:null,attackOrder:null,destination:null,
    route:{waypoints:[]},routeAge:7,navWatch:{stalls:1},approachCache:{point:{}},
    ravenDistraction:{id:1},healJob:{id:2},scouting:true,
    unreachableTarget:null,unreachableTime:0,workerRetryTime:0,
    constructJob:null,repairJob:null};
}
function building(id,clanId='orcs',type='hut',x=0,z=0,health=100){
  return {id,clanId,type,health,maxHealth:100,dead:false,destroyed:false,
    hitbox:{minX:x-1,maxX:x+1,minZ:z-1,maxZ:z+1}};
}
function distanceToBuilding(point,hitbox){
  const x=Math.max(hitbox.minX,Math.min(hitbox.maxX,point.x));
  const z=Math.max(hitbox.minZ,Math.min(hitbox.maxZ,point.z));
  return Math.hypot(point.x-x,point.z-z);
}
function fixture(){
  const units=[],buildings=[],events=[],ai={orc:false,witch:false};
  let visible=()=>true,safeGoal=()=>null;
  const side=u=>u.kind==='orc'?'orcs':'witch';
  const enemyOf=(actor,target)=>target&&!target.dead&&!target.destroyed&&
    (target.clanId||side(target))!=='neutral'&&
    side(actor)!==(target.clanId||side(target));
  const targetDistance=(actor,target)=>target.hitbox?
    distanceToBuilding(actor.root.position,target.hitbox):
    Math.hypot(target.root.position.x-actor.root.position.x,
      target.root.position.z-actor.root.position.z);
  const api=create({units,isBuilding:target=>!!target?.hitbox,enemyOf,
    isFighter:u=>u.role!=='worker',isWorker:u=>u.role==='worker',
    aiEnabled:kind=>ai[kind],
    raidingAttacked:(ally,attacker)=>{
      events.push('retaliate:'+ally.id);
      ally.retaliationTarget=attacker;
    },
    cancelSoulJob:u=>events.push('cancelSoul:'+u.id),
    cancelFoodJob:u=>events.push('cancelFood:'+u.id),
    liveBuildings:()=>buildings.filter(b=>!b.destroyed),
    unitFaction:side,distanceToBuilding,targetDistance,
    visibleAt:(x,z,kind)=>visible(x,z,kind),
    findSafeGoal:point=>{events.push('safeGoal');return safeGoal(point);},
    orderRepair:(workers,target,options)=>{
      for(const worker of workers){
        events.push('repair:'+worker.id+':'+target.id+':'+options.byAI);
        worker.repairJob={buildingId:target.id};
      }
    }});
  return {api,units,buildings,events,ai,
    setVisible:fn=>{visible=fn;},setSafeGoal:fn=>{safeGoal=fn;}};
}

// Invalid/friendly blows never summon guards or interrupt a raid.
{
  const f=fixture(),victim=unit('witch',1),attacker=unit('orc',2);
  const ally=unit('witch',3);f.units.push(victim,ally);
  f.api.alertNearbyDefenders(victim,null);
  f.api.alertNearbyDefenders(victim,unit('witch',4));
  attacker.dead=true;f.api.alertNearbyDefenders(victim,attacker);
  attacker.dead=false;victim.dead=true;f.api.alertNearbyDefenders(victim,attacker);
  assert.deepEqual(f.events,[]);assert.equal(ally.attackOrder,null);
}

// Raiding squadmates help within eight units first, but never become home
// guards. Idle home fighters within 18 join afterward; human move orders win.
{
  const f=fixture(),victim=unit('witch',1,0,0),enemy=unit('orc',2);
  victim.raiding=true;
  const close=unit('witch',3,6,0),edge=unit('witch',4,8,0);
  const far=unit('witch',5,8.01,0),worker=unit('witch',6,1,0,'worker');
  const guard=unit('witch',7,17,0),edgeGuard=unit('witch',8,18,0);
  const outside=unit('witch',9,18.01,0),busy=unit('witch',10,2,0);
  close.raiding=edge.raiding=far.raiding=true;
  busy.destination={x:30,z:30};
  f.units.push(victim,close,edge,far,worker,guard,edgeGuard,outside,busy);
  f.api.alertNearbyDefenders(victim,enemy);
  assert.deepEqual(f.events,[
    'retaliate:1','retaliate:3','retaliate:4',
    'cancelSoul:7','cancelFood:7','cancelSoul:8','cancelFood:8']);
  assert.equal(far.retaliationTarget,undefined);
  assert.equal(close.defenseAnchor,null,'Raiders must remain raiders');
  assert.deepEqual(guard.defenseAnchor,{x:0,z:0,radius:13,
    returnPoint:{x:17,z:0}});
  assert.equal(guard.attackOrder,enemy);assert.equal(guard.defenseTime,18);
  assert.equal(guard.ravenDistraction,null);assert.equal(guard.healJob,null);
  assert.equal(guard.scouting,false);assert.equal(guard.destination,null);
  assert.equal(guard.route,null);assert.equal(guard.routeAge,0);
  assert.equal(guard.navWatch,null);assert.equal(guard.approachCache,null);
  assert.equal(busy.attackOrder,null);assert.equal(outside.attackOrder,null);
  f.events.length=0;
  f.api.alertNearbyDefenders(victim,enemy);
  assert.deepEqual(f.events,['retaliate:1','retaliate:3','retaliate:4'],
    'An existing response must not cancel guard jobs twice');
}

// An AI guard can be interrupted even during an explicit move/attack order;
// its longer existing defensive timer is never shortened.
{
  const f=fixture(),victim=unit('orc',1,0,0),enemy=unit('witch',2);
  const busy=unit('orc',3,1,1);busy.destination={x:30,z:30};
  busy.attackOrder=unit('witch',99);busy.defenseTime=35;
  f.units.push(victim,busy);f.ai.orc=true;
  f.api.alertNearbyDefenders(victim,enemy);
  assert.equal(busy.attackOrder,enemy);assert.equal(busy.defenseTime,35);
  assert.deepEqual(f.events,['cancelSoul:1','cancelFood:1',
    'cancelSoul:3','cancelFood:3']);
}

// A local post is the closest allied living building strictly closer than 12;
// otherwise anchor exactly at the threat and use the 13-unit fallback leash.
{
  const f=fixture(),actor=unit('witch',1,42,43);
  const near=building('near','witch','witch-house',3,0);
  const far=building('far','witch','hut',11,0);
  const hostile=building('enemy','orcs','barrack',0,0);
  const dead=building('dead','witch','hut',0,0);dead.destroyed=true;
  f.buildings.push(far,near,hostile,dead);
  assert.deepEqual(f.api.localDefensePost(actor,{x:0,z:0}),{
    x:3,z:0,buildingId:'near',radius:18,returnPoint:{x:42,z:43}});
  f.buildings.length=0;
  assert.deepEqual(f.api.localDefensePost(actor,{x:100,z:200}),{
    x:100,z:200,buildingId:null,radius:13,returnPoint:{x:42,z:43}});
  f.buildings.push(building('boundary','witch','hut',13,0));
  assert.equal(f.api.localDefensePost(actor,{x:0,z:0}).buildingId,null,
    'Distance exactly 12 must not qualify');
}

// Returning clears only the historic navigation/attack state and preserves
// other fields, including routeAge, without requiring a returnPoint.
{
  const f=fixture(),actor=unit('witch',1,2,3);
  const before={...actor};f.api.returnFromDefense(actor);
  assert.deepEqual(actor,before,'No defense post means no mutation');
  actor.defenseAnchor={x:0,z:0,returnPoint:{x:7,z:8}};
  actor.attackOrder=unit('orc',2);f.api.returnFromDefense(actor);
  assert.deepEqual(actor.destination,{x:7,z:8});
  assert.equal(actor.defenseAnchor,null);assert.equal(actor.attackOrder,null);
  assert.equal(actor.route,null);assert.equal(actor.navWatch,null);
  assert.equal(actor.approachCache,null);assert.equal(actor.routeAge,7);
  actor.defenseAnchor={x:0,z:0};actor.destination=null;
  f.api.returnFromDefense(actor);
  assert.deepEqual(actor.destination,{x:2,z:3});
}

// Within its defensive leash a guard keeps the existing target. Enemy
// buildings use hitbox centres, not model origins, for this decision.
{
  const f=fixture(),guard=unit('witch',1);
  guard.defenseAnchor={x:0,z:0,radius:18,returnPoint:{x:5,z:5}};
  const enemy=building('orc-base','orcs','barrack',18,0);
  guard.attackOrder=enemy;f.units.push(guard);
  f.api.updateVillageDefense(guard);
  assert.equal(guard.attackOrder,enemy);assert.equal(guard.unreachableTarget,null);
  assert.equal(guard.defenseAnchor.radius,18);
}

// Once a target escapes, the nearest visible intruder is preferred; the
// escaping target is temporarily blacklisted for five seconds.
{
  const f=fixture(),guard=unit('witch',1,0,0);
  guard.defenseAnchor={x:0,z:0,radius:13,returnPoint:{x:4,z:4}};
  const fleeing=unit('orc',2,20,0),close=unit('orc',3,8,0);
  const nearerHidden=unit('orc',4,2,0),outside=unit('orc',5,14,0);
  guard.attackOrder=fleeing;guard.destination={x:9,z:9};
  f.units.push(guard,fleeing,close,nearerHidden,outside);
  f.setVisible(x=>x!==2);
  f.api.updateVillageDefense(guard);
  assert.equal(guard.unreachableTarget,fleeing);
  assert.equal(guard.unreachableTime,5);
  assert.equal(guard.attackOrder,close);
  assert.equal(guard.destination,null);assert.equal(guard.route,null);
  assert.equal(guard.navWatch,null);assert(guard.defenseAnchor);
  close.root.position.x=20;
  f.api.updateVillageDefense(guard);
  assert.equal(guard.attackOrder,null);assert.deepEqual(guard.destination,{x:4,z:4});
  assert.equal(guard.defenseAnchor,null);
  assert.equal(guard.unreachableTarget,close);
}

// An enemy that has died is no longer marked unreachable. Once its five-
// second exclusion expires, even a previously unreachable enemy is eligible.
{
  const f=fixture(),guard=unit('witch',1),enemy=unit('orc',2,4,0);
  guard.defenseAnchor={x:0,z:0,radius:13};guard.attackOrder=enemy;
  guard.unreachableTarget=enemy;guard.unreachableTime=0;
  enemy.dead=true;f.units.push(guard,enemy);
  f.api.updateVillageDefense(guard);
  assert.equal(guard.unreachableTime,0);
  assert.equal(guard.defenseAnchor,null);
  guard.defenseAnchor={x:0,z:0,radius:13};guard.attackOrder=null;
  enemy.dead=false;f.api.updateVillageDefense(guard);
  assert.equal(guard.attackOrder,enemy);
}

// Building damage broadcasts to up to six nearest guards (eight for HQ),
// including distant patrols if AI-controlled; no fog visibility is required.
{
  const f=fixture(),home=building('base','orcs','barrack',0,0,100);
  const attacker=unit('witch',90,0,0);
  for(let i=1;i<=10;i++){
    const guard=unit('orc',i,i*2,0);
    if(i===9)guard.raiding=true;
    f.units.push(guard);
  }
  f.ai.orc=true;f.setVisible(()=>false);
  f.api.alertVillageUnderAttack(home,attacker);
  const summoned=f.units.filter(u=>u.attackOrder===attacker);
  assert.deepEqual(summoned.map(u=>u.id),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(summoned.map(u=>u.defenseTime),Array(8).fill(45));
  assert.equal(f.units[8].attackOrder,null,'Raiding units cannot be recalled');
  assert.equal(f.units[9].attackOrder,null,'HQ cap is eight');
  assert.deepEqual(f.events.slice(0,4),[
    'cancelSoul:1','cancelFood:1','cancelSoul:2','cancelFood:2']);
  f.events.length=0;
  home.type='hut';for(const u of f.units){u.attackOrder=null;u.defenseAnchor=null;}
  f.api.alertVillageUnderAttack(home,attacker);
  assert.equal(f.units.filter(u=>u.attackOrder===attacker).length,6);
}

// An unchanged post keeps its original return point and does not cancel
// tasks twice. An alarm on a different building legitimately relocates it.
{
  const f=fixture(),guard=unit('witch',1,3,0),attacker=unit('orc',2);
  const first=building('first','witch','hut',0,0);
  const second=building('second','witch','hut',20,0);
  f.units.push(guard);
  f.api.alertVillageUnderAttack(first,attacker);
  const saved=guard.defenseAnchor.returnPoint;
  assert.deepEqual(saved,{x:3,z:0});
  f.events.length=0;
  guard.defenseTime=10;
  f.api.alertVillageUnderAttack(first,attacker);
  assert.equal(guard.defenseTime,45);
  assert.strictEqual(guard.defenseAnchor.returnPoint,saved);
  assert.deepEqual(f.events,[],'Same-target re-alarm is idempotent');
  f.setSafeGoal(()=>({x:16,z:1}));
  f.api.alertVillageUnderAttack(second,attacker);
  assert.equal(guard.defenseAnchor.buildingId,'second');
  assert.deepEqual(guard.defenseAnchor.returnPoint,{x:16,z:1});
  assert.deepEqual(f.events,['safeGoal','cancelSoul:1','cancelFood:1']);
}

// An unassisted human guard's explicit destination or attack order wins.
// Guards already defending may switch to the newly threatened building.
{
  const f=fixture(),home=building('home','witch','witch-house');
  const attacker=unit('orc',10),idle=unit('witch',1);
  const moving=unit('witch',2);moving.destination={x:5,z:5};
  const attacking=unit('witch',3);attacking.attackOrder=unit('orc',11);
  const defending=unit('witch',4);defending.attackOrder=unit('orc',12);
  defending.defenseAnchor={x:1,z:1,buildingId:'elsewhere',radius:18};
  f.units.push(idle,moving,attacking,defending);
  f.api.alertVillageUnderAttack(home,attacker);
  assert.equal(idle.attackOrder,attacker);
  assert.equal(defending.attackOrder,attacker);
  assert.notEqual(moving.attackOrder,attacker);
  assert.notEqual(attacking.attackOrder,attacker);
}

// Damage ratio boundaries: above 72% none; at 72% one; below 40% two.
// Existing repairs consume slots, delayed workers are excluded, and ordinary
// construction is interrupted only below 30%.
{
  const f=fixture(),home=building('home','witch','witch-house');
  const attacker=unit('orc',99),first=unit('witch',1,6,0,'worker');
  const second=unit('witch',2,2,0,'worker');
  const builder=unit('witch',3,1,0,'worker');builder.constructJob={id:'build'};
  const delayed=unit('witch',4,0,0,'worker');delayed.workerRetryTime=5;
  f.units.push(first,second,builder,delayed);
  home.health=73;f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,[]);
  home.health=72;f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,['repair:2:home:true']);
  f.events.length=0;
  home.health=40;f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,[],'At 40%, one assigned worker is sufficient');
  home.health=39;f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,['repair:1:home:true']);
  f.events.length=0;
  home.health=30;f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,[],'Exactly 30% must not interrupt construction');
  first.repairJob=null;second.repairJob=null;
  home.health=29;f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,['repair:2:home:true','repair:1:home:true'],
    'Non-builders must precede the closer builder');
  f.events.length=0;
  first.repairJob={buildingId:home.id};second.repairJob={buildingId:home.id};
  builder.repairJob=null;
  f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,[],'Two assigned repairs fill the emergency quota');
  second.repairJob=null;second.workerRetryTime=5;
  f.api.alertVillageUnderAttack(home,attacker);
  assert.deepEqual(f.events,['repair:3:home:true'],
    'Below 30%, an unfinished builder may be reassigned');
}

// No alarm for friendly/dead attackers or a destroyed/fully broken building.
{
  const f=fixture(),home=building('home','orcs','hut',0,0,100);
  const attacker=unit('witch',1),guard=unit('orc',2);
  f.units.push(guard);
  f.api.alertVillageUnderAttack(home,null);
  f.api.alertVillageUnderAttack(home,unit('orc',3));
  attacker.dead=true;f.api.alertVillageUnderAttack(home,attacker);
  attacker.dead=false;home.health=0;f.api.alertVillageUnderAttack(home,attacker);
  assert.equal(guard.attackOrder,null);assert.deepEqual(f.events,[]);
}

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(html.includes('rts-village-defense.js'));
assert(game.includes('window.FightersVillageDefense.create({'));
for(const call of ['alertNearbyDefenders(victim,attacker)',
  'localDefensePost(actor,threat)','returnFromDefense(actor)',
  'updateVillageDefense(actor)','alertVillageUnderAttack(building,attacker)'])
  assert(game.includes('return villageDefense.'+call),call+' must delegate');
console.log('PASS village defense: raid retaliation, guard priority, leash/return, alarms, repair urgency, exact boundaries and wiring');
