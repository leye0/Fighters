#!/usr/bin/env node
/** Pure geometry and strategic planning: stable masonry joints and open gate. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const wall=require('../app/rts-walls.js');
const fp=require('../app/rts-footprint.js');
const {Director}=require('../app/orc-strategy.js');

const horizontal={x:10,z:12,axis:'x'};
const next={x:13.2,z:12,axis:'x'};
const corner={x:11.6,z:13.6,axis:'z'};
assert(wall.compatible(horizontal,next),'Two sections must meet end-to-end');
assert(wall.compatible(horizontal,corner),'A right-angle turn must have the same joint');
assert(wall.compatible(next,corner),'The corner can share a stone pier with both runs');
assert(!wall.compatible(horizontal,{x:10.2,z:12,axis:'x'}),
 'Repeated sections may not overlap each other');
assert.equal(fp.segmentBlocked({x:10,z:9},{x:10,z:15},wall.shape(10,12,'x'),.38),true,
 'The wall must obstruct swept unit movement');
assert.equal(fp.segmentBlocked({x:9,z:12},{x:14,z:12},wall.shape(11.6,12,'z')),
 true,'Perpendicular wall must intercept a straight magic bolt');
assert.deepEqual(wall.resolve(13.18,12.03,[horizontal],[]),next,
 'New section must snap exactly to a straight run');
assert.deepEqual(wall.resolve(11.62,13.58,[horizontal],[]),corner,
 'New section must snap exactly to an L corner');

const buildings=[
 {id:'b',type:'barrack',x:15,z:20,level:1,queue:[],health:450,maxHealth:450,
  hitbox:{minX:13,maxX:17,minZ:18,maxZ:22}},
 {id:'h',type:'hut',x:22,z:21,level:1,queue:[],health:450,maxHealth:450,
  hitbox:{minX:20,maxX:24,minZ:19,maxZ:23}},
 {id:'c',type:'cauldron',x:16,z:13,level:1,queue:[],health:450,maxHealth:450,
  hitbox:{minX:14,maxX:18,minZ:11,maxZ:15}},
 {id:'f',type:'factory',x:23,z:13,level:1,queue:[],health:450,maxHealth:450,
  hitbox:{minX:21,maxX:25,minZ:11,maxZ:15}}
];
const perimeter=wall.perimeter(buildings);
const west=perimeter.filter(p=>p.side==='west').sort((a,b)=>a.z-b.z);
const gap=west.slice(1).some((p,i)=>p.z-west[i].z>wall.LENGTH*2+.01);
assert(gap,'The perimeter must contain a gate at least two sections wide');
assert(perimeter.some(p=>p.side==='south')&&perimeter.some(p=>p.side==='north'),
 'The proposed fortification needs multiple sides');
const candidate=wall.planWall(buildings,()=>true,{perimeter});
assert(candidate&&candidate.type==='wall'&&candidate.axis==='z');
assert.deepEqual(candidate,wall.planWall(buildings,()=>true,{perimeter}),
 'Wall planning must be deterministic');
assert.equal(wall.planWall(buildings,()=>false,{perimeter}),null,
 'Planner must not force an invalid or blocked wall site');
const ai=new Director();ai.clock=38;ai.tickCount=3;
const state={ready:true,running:true,paused:false,gold:1200,wood:200,
 buildings,orcs:[{id:1,role:'worker',x:19,z:18,health:80,maxHealth:80}],
 witches:[],enemyBaseKnown:false,scoutTarget:null,unitCap:15,
 populationCommitted:1,cauldronAvailable:true};
assert(ai.decide(state,()=>true).some(o=>o.type==='build'&&o.building==='wall'),
 'Developed orc village must propose stone defenses');
const constructed={...candidate,id:'wall-1',level:1,queue:[],health:280,maxHealth:280,
 hitbox:wall.shape(candidate.x,candidate.z,candidate.axis)};
state.buildings=[...buildings,constructed];
assert(!ai.decide(state,()=>true).some(o=>o.type==='upgrade'&&o.buildingId==='wall-1'),
 'Walls must never be upgraded as economic buildings');
console.log('PASS stone walls: solid sweeps, exact corner joints, snapped extensions, entrance, strategic construction.');
