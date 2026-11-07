import assert from 'node:assert/strict';
import appearance from '../app/orc-appearance.js';

assert.equal(appearance.SKIN_COLORS.length,4);
for(const color of appearance.SKIN_COLORS){
  const r=(color>>16)&255,g=(color>>8)&255,b=color&255;
  assert(g>=225&&g>r*1.7&&g>b*4,'Orc green must be vivid, not grey/olive');
}

class Attribute {
  constructor(data){this.data=data;this.count=data.length;}
  getX(i){return this.data[i][0];}
  getY(i){return this.data[i][1];}
  getZ(i){return this.data[i][2];}
  getComponent(i,j){return this.data[i][j];}
  setX(i,x){this.data[i][0]=x;}
  setZ(i,z){this.data[i][2]=z;}
}
class Geometry {
  constructor(positions,skinIndices,skinWeights){
    this.attributes={position:new Attribute(positions),skinIndex:new Attribute(skinIndices),
      skinWeight:new Attribute(skinWeights)};
    this.userData={};
  }
  clone(){return new Geometry(...['position','skinIndex','skinWeight'].map(key=>
    this.attributes[key].data.map(v=>[...v])));}
  getAttribute(key){return this.attributes[key];}
  computeVertexNormals(){}
  computeBoundingBox(){}
  computeBoundingSphere(){}
}
const source=new Geometry(
  [[.40,1.48,.25],[-.40,1.48,-.25],[.35,.32,.2],
    [.75,1.48,.15],[.12,1.87,.1],[.30,1.00,.15]],
  [[0,0,0,0],[0,0,0,0],[0,0,0,0],
    [1,0,0,0],[0,0,0,0],[1,0,0,0]],
  [[1,0,0,0],[1,0,0,0],[1,0,0,0],
    [1,0,0,0],[1,0,0,0],[1,0,0,0]]);
const bones=[{name:'spine_02'},{name:'hand_r'}];
const bulk=appearance.bulkyGarmentGeometry(source,bones);
assert.notEqual(bulk,source,'Never mutate the original clothing asset');
assert.equal(appearance.bulkyGarmentGeometry(source,bones),bulk,
  'Share one modified geometry across every role and spawned orc');
assert(bulk.getAttribute('position').getX(0)>source.getAttribute('position').getX(0)*1.35);
assert(bulk.getAttribute('position').getZ(0)>source.getAttribute('position').getZ(0)*1.18);
assert.equal(bulk.getAttribute('position').getX(2),.35,'Legs retain their geometry');
assert.equal(bulk.getAttribute('position').getX(3),.75,'Gripping hand is untouched');
assert.equal(bulk.getAttribute('position').getX(5),.30,'Wrist is untouched');
assert(bulk.getAttribute('position').getX(4)<.12*1.2,'Neck hardly expands');
assert.deepEqual(bones,[{name:'spine_02'},{name:'hand_r'}],
  'The original animated skeleton and sockets must never change');
assert(bulk.userData.orcChangedVertices>=2);
console.log('PASS ORC APPEARANCE: neon green palette, broad chest, shared mesh, unchanged hands and skeleton.');
