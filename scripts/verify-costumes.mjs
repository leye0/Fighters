#!/usr/bin/env node
// Structural validation for Quaternius Standard Peasant/Ranger + hair.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='app/models/';
function glb(file){
  const data=readFileSync(dir+file);
  assert.equal(data.toString('ascii',0,4),'glTF',file+' magic');
  const jsonLength=data.readUInt32LE(12);
  const json=JSON.parse(data.subarray(20,20+jsonLength).toString('utf8'));
  const skin=json.skins[0];
  assert(skin&&skin.joints.length===65,file+' rig 65 bones');
  const names=skin.joints.map(i=>json.nodes[i].name);
  const accessor=json.accessors[skin.inverseBindMatrices];
  const view=json.bufferViews[accessor.bufferView];
  const binOffset=20+jsonLength+8+(view.byteOffset||0)+(accessor.byteOffset||0);
  const bind=data.subarray(binOffset,binOffset+accessor.count*64);
  const ibm=createHash('sha256').update(bind).digest('hex');
  return {file,names,ibm,meshNames:json.nodes.filter(n=>n.mesh!==undefined).map(n=>n.name),
    drawPrimitives:json.meshes.reduce((n,m)=>n+m.primitives.length,0),
    animations:json.animations?.length||0};
}
const female=glb('human_female.glb'),male=glb('human_male.glb');
const outfitF=glb('quaternius_outfit_Female_Peasant.glb');
const rangerF=glb('quaternius_outfit_Female_Ranger.glb');
const outfitM=glb('quaternius_outfit_Male_Peasant.glb');
const bun=glb('quaternius_ubc_Hair_Buns.glb');
const buzz=glb('quaternius_ubc_Hair_Buzzed.glb');
const parted=glb('quaternius_ubc_Hair_SimpleParted.glb');
const long=glb('quaternius_ubc_Hair_Long.glb');
for(const m of [outfitF,rangerF,outfitM,bun,buzz,parted,long]){
  assert.deepEqual(m.names,female.names,m.file+' 65 joint order');
  assert.equal(m.animations,0,m.file+' is only the skin, source GLB supplies clips');
}
assert.equal(outfitF.ibm,female.ibm,'female garment rest + inverse bind matrices must be exact');
assert.equal(rangerF.ibm,female.ibm,'female Ranger inverse bind matrices must exactly match the animated base');
assert.equal(bun.ibm,female.ibm,'female hair rest must be exact');
assert.equal(long.ibm,female.ibm,'long female hair rest must be exact');
assert.equal(buzz.ibm,outfitM.ibm,'male buzzed hair bind must match male clothes');
assert.equal(parted.ibm,outfitM.ibm,'male parted hair bind must match male clothes');
assert.notEqual(outfitM.ibm,male.ibm,'male Peasant is a slightly different rest silhouette, checked visually in Chrome QA');
assert.equal(outfitF.meshNames.length,4);
assert.equal(rangerF.meshNames.length,9);
assert.equal(outfitM.meshNames.length,4);
assert.equal(outfitF.drawPrimitives,4,'female Peasant has four SkinnedMeshes');
assert.equal(rangerF.drawPrimitives,10,'Ranger Arms has two skin primitives');
assert.equal(outfitM.drawPrimitives,5,'male Peasant Arms has two skin primitives');
assert(outfitF.meshNames.every(x=>x.includes('Peasant'))&&outfitM.meshNames.every(x=>x.includes('Peasant')),'civilian clothes only');
assert(rangerF.meshNames.every(x=>x.startsWith('Female_Ranger_')),'Ranger parts must all belong to the same native outfit');
assert(rangerF.meshNames.includes('Female_Ranger_Head_Hood')&&
  rangerF.meshNames.includes('Female_Ranger_Acc_Pauldrons'),'Mage hood and guard pauldrons must exist');
assert.equal(bun.meshNames.length,1);
assert.equal(long.meshNames.length,1);
console.log(JSON.stringify({integrity:'PASS',outfits:3,hairStyles:4,joints:65,
  femaleExactRest:true,rangerExactRest:true,maleSameJointOrder:true,maleRestVariant:true,
  femaleMeshes:outfitF.meshNames,rangerMeshes:rangerF.meshNames,maleMeshes:outfitM.meshNames},null,2));
