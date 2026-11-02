#!/usr/bin/env node
/** Deterministic contact tests for the physical RTS unit radius. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {RADIUS,sweptCircleHit,freeForUnit,step,separate}=
  require('../docs/rts-unit-physics.js');
const {Navigator}=require('../docs/rts-navigation.js');
const nav=new Navigator({halfSize:28,radius:RADIUS});
nav.setObstacles([{minX:6,maxX:9,minZ:6,maxZ:9}]);
const unit=(id,x,z)=>({id,dead:false,root:{position:{x,z}}});
const a=unit(1,0,0),b=unit(2,1,0),c=unit(3,2,0);
assert(sweptCircleHit({x:0,z:0},{x:2,z:0},{x:1,z:0}),
  'Swept collision must catch a unit crossed in a long simulation frame');
assert(!freeForUnit({x:0,z:0},{x:2,z:0},a,[a,b],nav),
  'A unit may not tunnel through another unit');
assert(freeForUnit({x:0,z:0},{x:0,z:1},a,[a,b],nav),
  'Safe free tangent motion is accepted');
let p={x:0,z:0};
for(let i=0;i<400;i++){
 const next=step(p,{x:5,z:0},.06,a,[a,b,c],nav);
 if(next)p=next;
 assert(Math.hypot(p.x-b.root.position.x,p.z-b.root.position.z)>=2*RADIUS-.016,
  'Movement overlapped blocker b');
 assert(Math.hypot(p.x-c.root.position.x,p.z-c.root.position.z)>=2*RADIUS-.016,
  'Movement overlapped blocker c');
}
assert(p.x>4.5,'Sidestepping must lead around a line of standing units');
const d=unit(4,-3,0),e=unit(5,-3,0);
assert(separate([d,e],nav)>0,'Exactly overlapping idle units need separation');
assert(Math.hypot(d.root.position.x-e.root.position.x,
  d.root.position.z-e.root.position.z)>=2*RADIUS-.015);
assert(nav.pointClear(d.root.position)&&nav.pointClear(e.root.position));
const wall=unit(6,6-.8,7);
const candidate=step(wall.root.position,{x:11,z:7},.5,wall,[wall],nav);
assert(!candidate||nav.segmentClear(wall.root.position,candidate),
  'Movement may never penetrate the inflated building wall');
console.log('PASS physical RTS units: disk footprints, swept contacts, dynamic sidesteps, no overlapping idle units, building safety.');
