#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {FogGrid}=require('../docs/rts-fog.js');

const fog=new FogGrid({halfSize:28,cellSize:.5,radius:7.5,fade:1.25});
assert.equal(fog.size,112);
assert.equal(fog.sample(0,0).explored,0,'the world must begin unexplored');
fog.update('witch',[{x:-18,z:-14}]);
assert.equal(fog.visibleAt(-18,-14,'witch'),true);
assert.equal(fog.visibleAt(22,21,'witch'),false);
assert.equal(fog.exploredAt(22,21,'witch'),false);
assert.equal(fog.sample(-18,-14,'orc').explored,0,'clans have isolated maps');
assert.ok(fog.sample(-11,-14).visible>0&&fog.sample(-11,-14).visible<1,
  'vision boundary must fade instead of clipping to a hard square');
assert.equal(fog.sample(-10,-14).visible,0);

fog.update('witch',[{x:2,z:3}]);
assert.equal(fog.sample(-18,-14).visible,0,'old area is no longer in sight');
assert.equal(fog.sample(-18,-14).explored,1,'visited area stays explored');
assert.equal(fog.exploredAt(-18,-14,'witch'),true,
  'all actors in permanently discovered terrain remain visible');
assert.equal(fog.visibleAt(-18,-14,'witch'),false,
  'current sight remains distinct from discovery');
assert.equal(fog.sample(2,3).visible,1,'new area is uncovered by walking');
fog.update('witch',[{x:2,z:3},{x:9,z:3}]);
assert.equal(fog.sample(9,3).visible,1,'multiple scouts share sight');
fog.update('orc',[{x:22,z:21}]);
assert.equal(fog.sample(22,21,'orc').visible,1);
assert.equal(fog.sample(22,21,'witch').visible,0);
assert.equal(fog.sample(22,21,'witch').explored,0);
assert.equal(fog.exploredAt(22,21,'witch'),false,
  'enemy exploration never grants the player visibility');
assert.equal(fog.sample(28,0,'orc').explored,0,'out-of-world remains black');

const tex=fog.textureData('witch');
assert.equal(tex.length,112*112*4);
assert.equal(tex[(fog.index(2,3))*4],255);
assert.equal(tex[(fog.index(2,3))*4+1],255);
assert.equal(fog.stats('witch').bytes,150528,'bounded fog memory footprint');
fog.reset();
assert.equal(fog.sample(2,3).explored,0);
assert.equal(fog.exploredAt(-18,-14,'witch'),false,
  'new match resets permanent visibility');
assert.equal(fog.sample(22,21,'orc').visible,0);
assert.equal(fog.textureData('witch'),tex,'reset reuses GPU upload buffer');
console.log('PASS fog: black unknown, smooth sight, persistent exploration, two clans, 147 KiB');
