#!/usr/bin/env node
/** Soft RTS crowd steering: agents are not hard obstacles; buildings are. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {RADIUS,sweptCircleHit,freeForUnit,step,separate}=require('../docs/rts-unit-physics.js');
const {Navigator}=require('../docs/rts-navigation.js');
const unit=(id,x,z)=>({id,dead:false,root:{position:{x,z}}});
const nav=new Navigator({halfSize:28,radius:RADIUS});
nav.setObstacles([{minX:6,maxX:9,minZ:6,maxZ:9}]);

const mover=unit(1,0,0),blocker=unit(2,1,0);
assert(sweptCircleHit({x:0,z:0},{x:2,z:0},blocker.root.position),
 'Geometric overlap can be detected without being enforced as a hard wall');
assert(freeForUnit({x:0,z:0},{x:2,z:0},mover,[mover,blocker],nav),
 'Other units must NOT invalidate a traversable segment');
assert(!freeForUnit({x:5,z:7},{x:12,z:7},mover,[mover,blocker],nav),
 'Actual buildings remain solid obstacles');

// Open ground: soft steering prefers a lane around an idling neighbour.
const obstacle=unit(10,1,0),traveller=unit(11,0,0);
let p={x:0,z:0},sideDrift=0;
for(let i=0;i<150;i++){
 const next=step(p,{x:5,z:0},.06,traveller,[traveller,obstacle],nav);
 assert(next,'Open-field movement must not be blocked by an idle unit');
 p=next;traveller.root.position.x=p.x;traveller.root.position.z=p.z;
 sideDrift=Math.max(sideDrift,Math.abs(p.z));
}
assert(p.x>4.7,'Crowd steering must eventually reach destination');
assert(sideDrift>.04,'Agent should favor a free lane rather than walking directly through a neighbor');

// A narrow corridor has no free passing lane. Units must be able to overlap
// temporarily, instead of freezing at the mouth of the passage.
const corridor={
 segmentClear(a,b){return Math.abs(a.z)<.08&&Math.abs(b.z)<.08;},
 pointClear(p){return Math.abs(p.z)<.08;}
};
const standing=unit(20,1,0),passing=unit(21,0,0);
let q={x:0,z:0},overlapped=false;
for(let i=0;i<80;i++){
 const next=step(q,{x:3,z:0},.05,passing,[passing,standing],corridor);
 assert(next,'Units should never deadlock in a narrow corridor');
 q=next;passing.root.position.x=q.x;passing.root.position.z=q.z;
 if(Math.abs(q.x-standing.root.position.x)<RADIUS*2)overlapped=true;
}
assert(q.x>2.9,'Temporarily overlapping a standing unit should allow passage');
assert(overlapped,'The test must actually exercise last-resort overlap');

// Idle units spread gradually in open ground without teleports or jitter.
const idle=Array.from({length:5},(_,i)=>unit(i+31,-5,-5));
for(let frame=0;frame<150;frame++){
 separate(idle,nav,RADIUS,1/60);
 for(const a of idle)assert(nav.pointClear(a.root.position),'Dispersion went through a solid wall');
}
let tightest=Infinity;
for(let i=0;i<idle.length;i++)for(let j=i+1;j<idle.length;j++)
 tightest=Math.min(tightest,Math.hypot(
  idle[i].root.position.x-idle[j].root.position.x,
  idle[i].root.position.z-idle[j].root.position.z));
assert(tightest>RADIUS*1.8,'Idle group did not spread to available free space');

// If terrain forbids separation, retain overlap instead of wall clipping.
const trapped=[unit(70,0,0),unit(71,0,0)];
const noLateralRoom={
 segmentClear(a,b){return a.x===b.x&&a.z===b.z;},
 pointClear(){return true;}
};
for(let i=0;i<30;i++)separate(trapped,noLateralRoom,RADIUS,1/60);
assert.equal(trapped[0].root.position.x,0,'Do not force apart through walls');
assert.equal(trapped[1].root.position.x,0,'Do not force apart through walls');
console.log('PASS soft RTS crowds: preferred lanes, open-field dispersion, last-resort overlap and hard building walls.');
