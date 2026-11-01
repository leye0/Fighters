import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { copyToDocument } from '@gltf-transform/functions';

const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw Error('Usage: node split-orc-buildings.mjs <pack.glb> <output-dir>');
const io=new NodeIO();
const source=await io.read(input);
const scene=source.getRoot().listScenes()[0];
if(!scene)throw Error('GLB contains no scene');
const all=[];
const visit=node=>{all.push(node);node.listChildren().forEach(visit);};
scene.listChildren().forEach(visit);
const hasMesh=node=>!!node.getMesh()||node.listChildren().some(hasMesh);
const candidates=all.filter(node=>hasMesh(node)&&/^(?:orc_)?(?:barrack|hut|mine|factory|cauldron)_Lv[123]$/i.test(node.getName())&&node.listChildren().length>0);
// Reject mesh subnodes and prefer complete, named asset groups.
console.log('Candidate building groups:',candidates.map(n=>n.getName()).join(', '));
if(candidates.length<2)throw Error('Fewer than two complete named building groups found');
await fs.mkdir(output,{recursive:true});
const manifest=[];
for(let i=0;i<candidates.length;i++){
  const node=candidates[i];
  const doc=new (await import('@gltf-transform/core')).Document();
  const copied=copyToDocument(doc,source,[node]);
  const copy=doc.getRoot().listNodes().find(n=>n.getName()===node.getName()) || (copied?.propertyType==='Node'?copied:null);
  if(!copy)throw Error('Failed to copy node '+node.getName());
  const dstScene=doc.createScene('Building '+(i+1));
  dstScene.addChild(copy);
  const filename='building-'+String(i+1).padStart(2,'0')+'.glb';
  await io.write(path.join(output,filename),doc);
  manifest.push({id:'building-'+String(i+1).padStart(2,'0'),name:node.getName()||'Building '+(i+1),
    description:node.getExtras()?.description||null,sourceNode:node.getName()||null,
    file:'./models/orc-buildings/'+filename});
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({buildings:manifest},null,2));
console.log('Extracted',manifest.length,'building roots:',manifest.map(x=>x.name).join(', '));
