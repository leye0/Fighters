import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const forest = require('../docs/rts-forest.js');
const { Navigator } = require('../docs/rts-navigation.js');

const layout = forest.createLayout();
assert.deepEqual(layout,forest.createLayout(),'forest must stay deterministic across resets');
assert.equal(layout.length,55);
assert.deepEqual([...new Set(layout.map(t=>t.type))].sort(),forest.TYPES.slice().sort());
const obstacles=forest.obstacles(layout);
assert.equal(obstacles.length,layout.length);
const assets=path.join(path.dirname(fileURLToPath(import.meta.url)),'../docs/models/forest');
let assetBytes=0;
for(const kind of forest.TYPES){
  const buffer=fs.readFileSync(path.join(assets,kind+'.glb'));
  assetBytes+=buffer.byteLength;
  assert.equal(buffer.toString('ascii',0,4),'glTF');
  assert.equal(buffer.readUInt32LE(8),buffer.byteLength);
  const length=buffer.readUInt32LE(12);
  const metadata=JSON.parse(buffer.toString('utf8',20,20+length));
  assert.ok(metadata.meshes?.length>0,'actual model geometry absent: '+kind);
  if(kind==='twisted'||kind==='dead'){
    assert.ok(metadata.extensionsRequired?.includes('EXT_texture_webp'));
    assert.ok(metadata.images.every(image=>image.mimeType==='image/webp'));
  }
}
assert.ok(assetBytes<1_200_000,'forest assets exceed the lightweight download budget');
for(let i=0;i<layout.length;i++){
  const a=layout[i];
  assert.ok(Math.abs(a.x)<27&&Math.abs(a.z)<27);
  assert.ok(a.height>=3&&a.height<=7);
  for(let j=0;j<i;j++){
    const b=layout[j];
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=2.15-1e-9);
  }
}
const navigation=new Navigator();
navigation.setObstacles(obstacles);
for(const point of [{x:-18,z:-13},{x:-16.5,z:-15},{x:-19,z:-16},
  {x:22,z:22},{x:15,z:20},{x:1,z:26},{x:0,z:0}])
  assert.ok(navigation.pointClear(point),'initial unit/building position blocked: '+JSON.stringify(point));
assert.ok(navigation.plan({x:-18,z:-13},{x:5,z:5}),'forest blocked cross-map travel');
assert.ok(navigation.plan({x:22,z:22},{x:-18,z:-13}),'forest blocked enemy raid');
console.log(`Forest QA passed: ${layout.length} CC0 tree instances, ${forest.TYPES.length} shared GLBs, ${assetBytes} bytes`);
