import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
console.log('Source animation audit:',JSON.stringify(source.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length,targets:a.listChannels().map(c=>c.getTargetNode()?.getName()).filter(Boolean).slice(0,30)}))));
await fs.mkdir(output,{recursive:true});
const manifest=[];
let baselineTextureHashes=null;
let sharedTexturesVerified=true;
for(let i=0;i<candidates.length;i++){
  const node=candidates[i];
  const doc=new (await import('@gltf-transform/core')).Document();
  const descendants=new Set();
  const collect=n=>{descendants.add(n);n.listChildren().forEach(collect);};
  collect(node);
  const targetNames=new Set([...descendants].map(n=>n.getName()).filter(Boolean));
  const animations=source.getRoot().listAnimations().filter(a=>a.listChannels().some(c=>descendants.has(c.getTargetNode())));
  const copied=copyToDocument(doc,source,[node,...animations]);
  const copy=doc.getRoot().listNodes().find(n=>n.getName()===node.getName()) || (copied?.propertyType==='Node'?copied:null);
  if(!copy)throw Error('Failed to copy node '+node.getName());
  const dstScene=doc.createScene('Building '+(i+1));
  dstScene.addChild(copy);
  const filename='building-'+String(i+1).padStart(2,'0')+'.glb';
  // Remove channels targeting nodes outside this building. A source clip may animate all buildings.
  for(const animation of doc.getRoot().listAnimations()){
    const copiedNodes=new Set(doc.getRoot().listNodes());
    for(const channel of [...animation.listChannels()]){
      if(!copiedNodes.has(channel.getTargetNode()) || !targetNames.has(channel.getTargetNode()?.getName()))channel.dispose();
    }
    if(!animation.listChannels().length)animation.dispose();
  }
  console.log('Export animation audit',node.getName(),doc.getRoot().listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().length})));
  await io.write(path.join(output,filename),doc);
  const textureStats=doc.getRoot().listTextures().map(t=>{
    const image=t.getImage();
    return {name:t.getName(),mime:t.getMimeType(),bytes:image?.byteLength||0,
      sha:image?createHash('sha256').update(image).digest('hex'):null};
  });
  console.log('Building texture audit',node.getName(),JSON.stringify(textureStats));
  const hashes=textureStats.map(t=>t.sha);
  if(!baselineTextureHashes)baselineTextureHashes=hashes;
  else if(JSON.stringify(hashes)!==JSON.stringify(baselineTextureHashes))sharedTexturesVerified=false;
  const stat=await fs.stat(path.join(output,filename));
  console.log('Building asset',node.getName(),'bytes',stat.size,'meshes',doc.getRoot().listMeshes().length,'textures',doc.getRoot().listTextures().length);
  manifest.push({id:'building-'+String(i+1).padStart(2,'0'),name:node.getName()||'Building '+(i+1),
    description:node.getExtras()?.description||null,sourceNode:node.getName()||null,
    file:'./models/orc-buildings/'+filename});
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({buildings:manifest,sharedTexturesVerified,textureHashes:baselineTextureHashes},null,2));
console.log('Extracted',manifest.length,'building roots:',manifest.map(x=>x.name).join(', '));
