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
const children=scene.listChildren();
const roots=children.length===1&&children[0].listChildren().length>1&&!children[0].getMesh()
  ?children[0].listChildren():children;
const hasMesh=node=>!!node.getMesh()||node.listChildren().some(hasMesh);
let candidates=roots.filter(hasMesh);
const walk=(node,depth=0)=>{const mesh=node.getMesh();return {name:node.getName(),mesh:!!mesh,depth,children:node.listChildren().map(n=>walk(n,depth+1))};};
console.log('Orc GLB hierarchy:',JSON.stringify(scene.listChildren().map(n=>walk(n)),null,2));
if(candidates.length<2){
  // Some packs are a single scene node with every object nested further down.
  // Find the first hierarchy level that actually contains multiple subtrees.
  let frontier=[...roots];
  while(frontier.length&&candidates.length<2){
    const next=frontier.flatMap(n=>n.listChildren()).filter(hasMesh);
    if(next.length<2)break;
    candidates=next;
    frontier=next;
  }
}
if(candidates.length<2)throw Error('Unable to isolate building roots; hierarchy logged above');
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
