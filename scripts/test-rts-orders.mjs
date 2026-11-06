import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-orders.js');
const calls=[];
const navigation={
  pointClear:()=>true,segmentClear:()=>true,plan:()=>null
};
const orders=create({
  navigation,
  formationGoals:(actors,destination,nav,{spacing})=>{
    assert.equal(nav,navigation);
    calls.push(['formation',actors.length,spacing]);
    return actors.map((actor,i)=>i?null:{x:destination.x+2,z:destination.z});
  },
  cancelMoveWork:actor=>{actor.repairJob=null;actor.farmJob=null;calls.push(['cancel',actor.id]);},
  endRaid:actor=>{actor.raiding=false;calls.push(['endRaid',actor.id]);},
  beginRaid:actor=>{actor.raiding=true;calls.push(['beginRaid',actor.id]);},
  canAttack:(actor,target)=>!actor.dead&&actor.role==='melee'&&target?.clanId!=='witch',
  isBuilding:target=>!!target.hitbox,
  cancelSoulJob:actor=>{actor.soulJob=null;},
  cancelFoodJob:actor=>{actor.orcFoodJob=null;}
});
const actor=id=>({id,role:'melee',kind:'witch',dead:false,
  root:{position:{x:0,z:0}},repairJob:{},farmJob:{},
  attackOrder:{id:'old-target'},raiding:true,defenseAnchor:{x:1,z:1},
  route:{waypoints:[]},approachCache:{id:'old-target'},navWatch:{stalls:1}});
const a=actor('a'),b=actor('b');
assert.equal(orders.move([a,b],{x:5,z:4},{spacing:.72,withinRadius:1}),2);
assert.deepEqual(a.destination,{x:5,z:4},'sanctuary move overrides far formation slot');
assert.deepEqual(b.destination,{x:5,z:4},'sanctuary accepts a missing formation slot');
for(const unit of [a,b]){
  assert.equal(unit.attackOrder,null,'movement interrupts attacks even against buildings');
  assert.equal(unit.raiding,false,'movement ends the raid state');
  assert.equal(unit.repairJob,null);
  assert.equal(unit.farmJob,null);
  assert.equal(unit.route,null);
  assert.equal(unit.routeVersion,-1);
  assert.equal(unit.defenseAnchor,null);
}
assert.deepEqual(calls.slice(0,5),[
  ['cancel','a'],['cancel','b'],['formation',2,.72],['endRaid','a'],['endRaid','b']
]);
const enemyBuilding={id:'enemy-house',clanId:'orcs',hitbox:{}};
assert.equal(orders.attack([a,b],enemyBuilding),2);
for(const unit of [a,b]){
  assert.equal(unit.attackOrder,enemyBuilding);
  assert.equal(unit.destination,null);
  assert.equal(unit.raiding,true);
  assert.equal(unit.unreachableTime,0);
  assert.equal(unit.approachCache,null);
}
// An explicit move always cancels an ongoing building assault.
orders.move([a],{x:2,z:3});
assert.equal(a.attackOrder,null);
assert.equal(a.raiding,false);
const foe={id:'orc',clanId:'orcs'};
assert.equal(orders.attack([a],foe),1);
assert.equal(a.raiding,false,'targeting a unit is not a building raid');
a.dead=true;
assert.equal(orders.attack([a],enemyBuilding),0,'dead units never receive attacks');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(html.includes('window.FightersOrders.create('));
assert(html.includes('unitOrders.move(actors,destination,{spacing,withinRadius})'));
assert(html.includes('unitOrders.attack(actors,target)'));
console.log('PASS isolated unit move/attack orders, sanctuary slots and raid interruption');
