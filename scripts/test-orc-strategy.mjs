#!/usr/bin/env node
/** Fast deterministic tests for village planning and strategic orc behavior. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Director,planSite,COST}=require('../app/orc-strategy.js');
const {FogGrid}=require('../app/rts-fog.js');
const valid=(x,z)=>x>=3&&x<=25&&z>=3&&z<=25&&!(x>=14&&x<=19&&z>=14&&z<=20);
const starting=[
 {id:'b',type:'barrack',x:15,z:20,level:1,queue:[],maxHealth:100,health:100},
 {id:'h',type:'hut',x:22,z:21,level:1,queue:[],maxHealth:100,health:100},
 {id:'c',type:'cauldron',x:16,z:13,level:1,queue:[],maxHealth:100,health:100},
 {id:'f',type:'factory',x:23,z:13,level:1,queue:[],maxHealth:100,health:100}
];
for(const type of Object.keys(COST)){
 const site=planSite(type,starting,valid);
 assert(site&&valid(site.x,site.z),'Missing valid '+type+' village site');
 assert.equal(site.type,type);
 assert.deepEqual(site,planSite(type,starting,valid),'Planning must be deterministic');
}
assert.equal(planSite('hut',starting,()=>false),null,'No illegal fallback placement');
assert.equal(planSite('mine',starting,valid),null,
 'Mines are fixed natural deposits and cannot be planned or constructed');
assert(!Object.hasOwn(COST,'mine'),'Build cost catalog must not list mines');

// A hut creates a real supply ceiling; the director may not queue beyond it.
const capDirector=new Director();
const cappedState={ready:true,running:true,paused:false,gold:900,
 buildings:starting,orcs:[
  {id:1,role:'worker',dead:false},{id:2,role:'worker',dead:false},
  {id:3,role:'melee',dead:false},{id:4,role:'melee',dead:false}],
 witches:[],enemyBaseKnown:false,scoutTarget:null,
 unitCap:4,populationCommitted:4,cauldronAvailable:false};
assert(!capDirector.update(3,cappedState,()=>false).some(o=>o.type==='train'),
  'At housing capacity the orcs must stop recruiting');
cappedState.unitCap=10;
for(let i=0;i<4;i++){
 const orders=capDirector.update(3,cappedState,()=>false);
 assert(!orders.some(o=>o.type==='train'&&o.role==='ranged'),
   'The director must not recruit mages without a cauldron');
}
cappedState.populationCommitted=10;
assert(capDirector.decide(cappedState,()=>false).some(o=>
 o.type==='upgrade'&&o.reason==='housing'),
 'A filled settlement must upgrade huts if no expansion site exists');
capDirector.clock=21;
const buildableCapOrders=capDirector.decide(cappedState,valid);
assert(buildableCapOrders.some(o=>o.type==='build'&&o.building==='hut'),
 'A filled settlement with room to expand must plan a new hut');
assert(!buildableCapOrders.some(o=>o.reason==='housing'),
 'A cheaper new hut must precede a housing upgrade');
assert(capDirector.update(3,cappedState,valid).some(o=>o.type==='build'),
 'Hut construction must win the economic tick over additional recruitment');

const fog=new FogGrid();
fog.update('witch',[{x:-20,z:-18}]);
fog.update('orc',[{x:19,z:18}]);
assert.equal(fog.sample(19,18,'witch').explored,0,
 'Orc exploration must never uncover the player faction map');
assert(fog.sample(19,18,'orc').visible>.9,
 'Orc sight must be stored privately for their strategic decisions');
const waypoint=fog.frontier('orc',{x:19,z:18},()=>true);
assert(waypoint&&fog.sample(waypoint.x,waypoint.z,'orc').explored<.15,
 'Scouting must choose unseen terrain from its own discovery map');
assert.deepEqual(waypoint,fog.frontier('orc',{x:19,z:18},()=>true),
 'Scouting targets must be deterministic');
assert.equal(fog.frontier('orc',{x:19,z:18},()=>false),null,
 'No scouting waypoint may violate path/navigation constraints');

// The director receives clan infrastructure only; world deposits have no owner.
assert(starting.every(b=>b.type!=='mine'),
 'Natural deposits must not be part of the clan settlement state');

const director=new Director();
let state={
 ready:true,running:true,paused:false,gold:900,buildings:starting,
 orcs:Array.from({length:4},(_,i)=>({id:i+1,x:18+i,z:16,
  health:100,maxHealth:100,attackOrder:false,dead:false})),
 witches:[],enemyBaseKnown:false,scoutTarget:{x:7,z:7},unitCap:16
};
const feedingDirector=new Director();
feedingDirector.clock=15;
const feedingState={...state,orcs:state.orcs.map(u=>({...u,role:'melee',
  foraging:true})),gold:0};
assert(!feedingDirector.decide(feedingState,valid).some(a=>a.type==='scout'),
  'An AI scout must not interrupt a meal to issue a new movement order');
feedingState.enemyBaseKnown=true;
assert(!feedingDirector.decide(feedingState,valid).some(a=>a.type==='raid'),
  'A raiding squad must leave feeding orcs to finish their meals');
let actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='train'),'AI must start recruiting');
assert(!actions.some(a=>a.type==='raid'),'AI must not rush before developing base');
state.witches=[{id:'enemy',x:17,z:17,dead:false}];
actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='defend'),'AI must defend village under attack');
assert.equal(director.mode,'defend');
state.witches=[];state.orcs.push({id:5,x:21,z:17,health:110,maxHealth:110});
for(let i=0;i<10;i++)actions=director.update(3,state,valid);
assert(director.clock>30);
assert(director.snapshot().decisions.some(a=>a.type==='scout'),
 'AI must send a physical scout into its own unexplored territory');
assert(!director.snapshot().decisions.some(a=>a.type==='raid'),
 'AI must never raid an undiscovered enemy base, even with a ready squad');
state.enemyBaseKnown=true;
state.scoutTarget=null;
for(let i=0;i<3;i++)actions=director.update(3,state,valid);
assert(director.snapshot().decisions.some(a=>a.type==='raid'),
 'AI must raid only after a scout has discovered the enemy headquarters');
assert(director.snapshot().decisions.some(a=>a.type==='build'),
 'AI must expand the village at suitable sites');
assert(!director.snapshot().decisions.some(a=>a.type==='build'&&a.building==='mine'),
 'Orc director illegally generated a new natural mine');

director.reset();
assert.equal(director.snapshot().raids,0);
assert.equal(director.snapshot().decisions.length,0);
director.enabled=false;
assert.equal(director.update(3,state,valid).length,0);
console.log('PASS orc strategic AI: village layout, recruitment, defense, fog-based scouting, no omniscient raids, discovery-gated attacks, reset.');
