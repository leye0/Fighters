#!/usr/bin/env node
/** Square-on-screen arena geometry and gameplay boundaries. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const map=require('../app/rts-map.js');
const {Navigator}=require('../app/rts-navigation.js');
const forest=require('../app/rts-forest.js');
const berries=require('../app/rts-berries.js');
const {Hares}=require('../app/rts-orc-food.js');

for(const [u,v] of [[0,0],[-28,-28],[28,-28],[28,28],[-28,28],[7,-11]]){
  const world=map.toWorld(u,v),back=map.toMap(world.x,world.z);
  assert.ok(Math.hypot(back.x-u,back.z-v)<1e-10,'Map/world conversion must round-trip');
}
// For the fixed 45°/35.264° orthographic camera, the screen coordinates of
// ground points are (x-z)/sqrt(2) and (x+z)/sqrt(6). Both extents are 56.
const corners=map.corners().map(p=>({
  x:(p.x-p.z)/Math.sqrt(2),y:(p.x+p.z)/Math.sqrt(6)
}));
assert.deepEqual(corners.map(c=>[Math.round(c.x),Math.round(c.y)]),
  [[-28,-28],[28,-28],[28,28],[-28,28]],
  'The isometric terrain, not just its minimap canvas, must look square');
assert.ok(map.contains(-23.5,-17.5,3)&&map.contains(22,21,3),
  'Both headquarters must remain inside the playing field');
const nav=new Navigator({halfSize:map.worldHalf,region:map});
assert.ok(nav.pointClear({x:0,z:0}),'Map centre must be walkable');
assert.ok(!nav.pointClear({x:54,z:54})&&!nav.pointClear({x:-54,z:54}),
  'The old world-space square cannot remain the invisible play boundary');
for(const p of map.corners()){
  assert.ok(!nav.pointClear(p),'Ground edge must stop units at their collision radius');
  const inside=nav.clamp(p);
  assert.ok(nav.pointClear(inside),'Clamping must return a walkable edge position');
}
const route=nav.plan({x:-18,z:-13},{x:20,z:20});
assert.ok(route?.waypoints.length,'The two clans must be able to cross the new terrain');
for(const waypoint of route.waypoints)
  assert.ok(map.contains(waypoint.x,waypoint.z,.3),'A* must not leave the square map');

const trees=forest.createLayout({map});
assert.equal(trees.length,55,'Preserve the forest population');
assert.deepEqual(trees,forest.createLayout({map}),'Forest relocation must be deterministic');
assert.ok(trees.every(t=>map.contains(t.x,t.z,t.radius)),
  'Trees must not grow beyond the new terrain border');
const bushes=berries.createLayout(trees,undefined,map);
assert.equal(bushes.length,28,'Preserve the berry shrub population');
assert.ok(bushes.every(b=>map.contains(b.x,b.z,1)),
  'Wild berries must remain accessible');
const hares=new Hares({halfSize:map.worldHalf,
  walkable:(x,z)=>nav.pointClear({x,z})});
assert.ok(hares.hares.every(h=>map.contains(h.x,h.z)),
  'Hares must spawn in the square battlefield');
for(let i=0;i<400;i++)hares.step(.1);
assert.ok(hares.hares.every(h=>map.contains(h.x,h.z)),
  'Hares must stay inside the new battlefield');
console.log('PASS square isometric map: projection, minimap axes, navigation, forest, berries, hares');
