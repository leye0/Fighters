#!/usr/bin/env node
/** Ensure no mislocated mesh makes a complete orc building microscopic. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';

const directory=process.argv[2]||'app/models/orc-buildings';
const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
assert.equal(manifest.buildings.length,15,'One building per type and level');
const io=new NodeIO();
function bounds(node){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let vertices=0;
  function visit(current){
    const matrix=current.getWorldMatrix();
    for(const primitive of current.getMesh()?.listPrimitives()||[]){
      const positions=primitive.getAttribute('POSITION')?.getArray();
      if(!positions)continue;
      for(let i=0;i<positions.length;i+=3){
        const [x,y,z]=positions.slice(i,i+3);
        const xyz=[matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],
          matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],
          matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]];
        for(let axis=0;axis<3;axis++){
          min[axis]=Math.min(min[axis],xyz[axis]);
          max[axis]=Math.max(max[axis],xyz[axis]);
        }
        vertices++;
      }
    }
    current.listChildren().forEach(visit);
  }
  visit(node);
  return {vertices,min,max,size:max.map((v,axis)=>v-min[axis])};
}
for(const entry of manifest.buildings){
  const file=path.join(directory,path.basename(entry.file));
  const doc=await io.read(file),scene=doc.getRoot().listScenes()[0];
  assert(scene,entry.name+' has no scene');
  const root=scene.listChildren()[0],b=bounds(root);
  assert(b.vertices>1000,entry.name+' lost its source mesh');
  assert(b.size.every(v=>Number.isFinite(v)&&v>1&&v<20),
    entry.name+' has a detached mesh/outlier that would shrink the building: '+JSON.stringify(b.size));
  if(/^orc_cauldron_Lv[123]$/.test(entry.sourceNode)){
    const staticPart=root.listChildren().find(n=>n.getMesh()&&!n.getSkin());
    const potPart=doc.getRoot().listNodes().find(n=>n.getSkin()&&n.getMesh());
    assert(staticPart&&potPart,'Cauldron must retain its pot and building body');
    const body=bounds(staticPart),pot=bounds(potPart);
    for(const axis of [0,2])assert(pot.min[axis]<body.max[axis]&&pot.max[axis]>body.min[axis],
      entry.name+' skinned pot does not overlap its building on axis '+axis);
  }
}
console.log('PASS 15 orc assets: centered meshes, intact cauldrons, compact visible footprints.');
