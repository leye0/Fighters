#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Flock,SCOUT_SIGHT}=require('../docs/rts-ravens.js');
const {createLayout}=require('../docs/rts-forest.js');
const {FogGrid}=require('../docs/rts-fog.js');

const trees=createLayout(),flock=new Flock(trees);
assert.equal(flock.ravens.length,2,'the Witch faction starts with two ravens');
assert.ok(flock.ravens.every(r=>r.mode==='perched'&&
  Math.abs(r.y-trees[r.treeIndex].height-.06)<1e-6),
  'birds must start perched on real tree tops, not at ground level');
const initial=flock.ravens.map(r=>({...r}));
const fog=new FogGrid();
const first=flock.ravens[0];
fog.update('witch',[flock.visionSources()[0]]);
assert.ok(fog.visibleAt(first.x,first.z,'witch'));
assert.equal(fog.sample(first.x+5,first.z,'witch').visible,0,
  'perched birds must reveal only a small local patch');
assert.equal(fog.sample(first.x,first.z,'orc').explored,0,
  'ravens must never leak the witches exploration to the orcs');
const before=new FogGrid(),after=new FogGrid();
before.update('witch',[{x:0,z:0,radius:3.1}]);
after.update('witch',[{x:0,z:0,radius:SCOUT_SIGHT}]);
const exploredCount=grid=>grid.maps.witch.explored.filter(Boolean).length;
const areaRatio=exploredCount(after)/exploredCount(before);
assert.ok(areaRatio>.45&&areaRatio<.55,
  'raven flight should uncover roughly half the previous area: '+areaRatio);

const called=flock.orderMove(flock.ravens[0].id,{x:17,z:17});
assert.ok(called&&called.mode==='flying'&&called.scoutSteps===4);
const start={x:called.x,z:called.z};
let sawTarget=false,landed=false;
for(let i=0;i<1500;i++){
  flock.update(1/30);
  if(Math.hypot(called.x-17,called.z-17)<.3)sawTarget=true;
  if(sawTarget&&called.mode==='perched'){landed=true;break;}
}
assert.ok(sawTarget,'a commanded raven must fly across unknown map territory');
assert.ok(landed,'after its imprecise scout pattern the raven returns to an actual tree');
assert.ok(distance(start,called)>3,'the command must produce meaningful travel');
assert.ok(flock.visionSources().every(s=>s.radius<=SCOUT_SIGHT),
  'the bird must never gain the full 7.5m soldier vision radius');

// A harvested perch or approaching orc causes flight, never a dead bird.
const perched=flock.ravens.find(r=>r.mode==='perched');
assert.ok(perched);
const occupied=perched.treeIndex;
trees[occupied].felled=true;flock.update(1/60);
assert.equal(perched.mode,'flying','cutting the supporting tree forces takeoff');
assert.equal(perched.treeIndex,null);
trees[occupied].felled=false;
const another=flock.ravens.find(r=>r.mode==='perched');
if(another){
  flock.update(1/60,[{x:another.x,z:another.z,dead:false}]);
  assert.equal(another.mode,'flying','an orc approaching a perched raven scares it away');
}
assert.ok(flock.nearestDecoy({x:perched.x,z:perched.z},1),
  'orcs can see a decoy without making it a damageable combat actor');
flock.reset();
assert.deepEqual(flock.ravens,initial,'reset must restore deterministic original perches');

// The GLB must be fetched from Polyfork itself: their license allows hotlinks
// but forbids redistributing their files on a repository or our own CDN.
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert.ok(html.includes('https://polyfork.dev/cdn/crow-base.glb'));
assert.ok(!fs.existsSync(new URL('../docs/models/crow.glb.gz',import.meta.url)));
console.log('PASS ravens: direct licensed CDN, tree perches, evasions, scouting and bounded fog');

function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
