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
assert.deepEqual(forest.TYPES,['twisted','dead'],
  'Only red twisted trees and bare dead trees belong in this forest');
const initialWitches=[{x:-18,z:-13},{x:-16.5,z:-15},{x:-19,z:-16}];
const initialVisible=layout.filter(tree=>
  initialWitches.some(unit=>Math.hypot(tree.x-unit.x,tree.z-unit.z)<6.25)&&
  // Isometric X/Z screen axis, portrait half-width comfortably above 4 m.
  Math.abs((tree.x+18)-(tree.z+14))/Math.SQRT2<4.5);
assert.ok(initialVisible.length>=3,
  'Opening viewport must visibly contain a witch-side forest glade');
const initialOrcs=[{x:15,z:17},{x:21,z:17},{x:19,z:23},{x:12,z:22}];
assert.ok(layout.filter(tree=>initialOrcs.some(unit=>
  Math.hypot(tree.x-unit.x,tree.z-unit.z)<7.1)).length>=2,
  'Orc scouts must also discover trees near their starting village');
assert.ok(layout.filter(tree=>Math.abs(tree.x)<16&&Math.abs(tree.z)<16).length>=12,
  'The playable map interior needs real groves, not only perimeter trees');
assert.deepEqual([...new Set(layout.map(t=>t.type))].sort(),forest.TYPES.slice().sort());
const obstacles=forest.obstacles(layout);
assert.equal(obstacles.length,layout.length);
assert.ok(obstacles.every(tree=>tree.id.startsWith('tree-')&&!('hitbox' in tree)),
  'Trees are navigator obstacles, never attackable building entities');
assert.ok(layout.every(tree=>Math.hypot(tree.x-8,tree.z+10)>=5),
  'Forest must preserve the standard orc construction site');
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
  assert.ok(metadata.extensionsRequired?.includes('EXT_texture_webp'));
  assert.ok(metadata.images.every(image=>image.mimeType==='image/webp'));
}
assert.ok(assetBytes<900_000,'forest assets exceed the lightweight download budget');
for(const unused of ['leafy','pine'])
  assert.ok(!fs.existsSync(path.join(assets,unused+'.glb')),
    'Unused green tree asset must not be bundled: '+unused);
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
