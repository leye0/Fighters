#!/usr/bin/env node
/** Deterministic navigation and collision regression tests (no browser/deps). */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {Navigator,segmentHitsBox}=require('../docs/rts-navigation.js');

const nav=new Navigator({halfSize:28,cellSize:1,radius:.36});
const house={id:'witch-house',minX:-3,maxX:3,minZ:-3,maxZ:3};
const barrack={id:'orc-barrack',minX:11,maxX:15,minZ:7,maxZ:11};
nav.setObstacles([house,barrack]);
assert(!nav.pointClear({x:0,z:0}),'Cannot stand inside building');
assert(!nav.pointClear({x:3.2,z:0}),'Unit radius blocks grazing wall');
assert(nav.pointClear({x:3.7,z:0}),'Unit can stand outside safety radius');
assert(!nav.segmentClear({x:-10,z:0},{x:10,z:0}),'Cannot walk through building');
assert(nav.segmentClear({x:-10,z:6},{x:10,z:6}),'Open route must stay direct');
assert(segmentHitsBox({x:-5,z:0},{x:5,z:0},house,.36),'Swept circle collides');
assert(!segmentHitsBox({x:-5,z:6},{x:5,z:6},house,.36),'Separate segment clear');
const route=nav.plan({x:-10,z:0},{x:10,z:0});
assert(route&&route.waypoints.length>=2,'A* must create a building detour');
let prev={x:-10,z:0};
for(const waypoint of route.waypoints){
 assert(nav.segmentClear(prev,waypoint),'Smoothed route must not clip corners');
 prev=waypoint;
}
assert(Math.hypot(prev.x-10,prev.z)<.1,'Detour must reach target');
const target=nav.findSafeGoal({x:0,z:0});
assert(target&&nav.pointClear(target),'Click on building must resolve outside wall');
assert(nav.plan({x:-10,z:0},{x:0,z:0})?.waypoints.length,'Can approach blocked building');

const before=nav.version;
nav.setObstacles([{id:'new',minX:0,maxX:3,minZ:-2,maxZ:2}]);
assert(nav.version>before,'Placement must invalidate existing navigation routes');
assert(nav.segmentClear({x:-10,z:0},{x:-1,z:0}),'Free approach stays free');
assert(!nav.segmentClear({x:-10,z:0},{x:10,z:0}),'New building blocks old path');
assert.equal(nav.advance({x:-10,z:0},{x:10,z:0},20),null,
 'A large frame step must never tunnel across a wall');

let position={x:-10,z:0};
const dynamic=nav.plan(position,{x:10,z:0});
assert(dynamic,'Path exists around newly built structure');
for(const waypoint of dynamic.waypoints){
 for(let steps=0;steps<1000&&Math.hypot(position.x-waypoint.x,position.z-waypoint.z)>.001;steps++){
  const next=nav.advance(position,waypoint,.13);
  assert(next,'Waypoint advancement blocked unexpectedly');
  assert(nav.pointClear(next),'Advanced unit intersects a building');
  position=next;
 }
}
assert(Math.hypot(position.x-10,position.z)<.1,'Unit follows valid detour to destination');
const corner=new Navigator({halfSize:8,cellSize:1,radius:.36});
corner.setObstacles([{minX:-1,maxX:0,minZ:0,maxZ:1},
 {minX:0,maxX:1,minZ:-1,maxZ:0}]);
const candidate=corner.plan({x:-3,z:-3},{x:3,z:3});
assert(candidate,'A* should route around touching diagonal obstacles');
let a={x:-3,z:-3};
for(const b of candidate.waypoints){assert(corner.segmentClear(a,b),'No diagonal corner cutting');a=b;}
console.log('PASS RTS navigation: A* detours, safe clicked-building goals, swept-radius collisions, diagonal corners, real stepping, dynamic invalidation.');
