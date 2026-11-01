import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO, copyToDocument } from '@gltf-transform/core';

const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw Error('Usage: node split-orc-buildings.mjs <pack.glb> <output-dir>');
const io=new NodeIO();
const source=await io.read(input);
const scene=source.getRoot().listScenes()[0];
if(!scene)throw Error('GLB contains no scene');
const children=scene.listChildren();
const roots=children.length===1&&children[0].listChildren().length>1&&!children[0].getMesh()
  ?children[0].listChildren():children;
const hasMesh=node=>!!node.getMesh()||node.listChildren().some(hasMesh);
const candidates=roots.filter(hasMesh);
if(candidates.length<2)throw Error('Cannot identify multiple top-level building roots; inspect asset hierarchy first');
await fs.mkdir(output,{recursive:true});
const manifest=[];
for(let i=0;i<candidates.length;i++){
  const node=candidates[i];
  const doc=io.createDocument();
  const copy=copyToDocument(doc,source,[node])[0];
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
