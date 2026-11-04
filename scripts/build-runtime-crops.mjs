import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO,Document} from '@gltf-transform/core';
import {copyToDocument} from '@gltf-transform/functions';
import sharp from 'sharp';
import {gzipSync} from 'node:zlib';

// Extract only the three wheat growth stages, never the other crops, soil
// meshes or exhibition-layout transforms from Bumroker's source GLB.
const input=process.argv[2],output=process.argv[3];
if(!input||!output)throw Error('Usage: build-runtime-crops.mjs <source.glb> <output.glb>');
const names=[1,2,3].map(stage=>'Wheat_F'+stage);
const io=new NodeIO(),source=await io.read(input);
const roots=source.getRoot().listNodes();
const chosen=names.map(name=>{
  const node=roots.find(n=>n.getName()===name);
  if(!node||!node.listChildren().some(child=>child.getMesh()))
    throw Error('Missing crop stage in source GLB: '+name);
  return node;
});
const result=new Document();
copyToDocument(result,source,chosen);
const scene=result.createScene('Fighters crops — Bumroker CC BY 4.0');
for(const name of names){
  const node=result.getRoot().listNodes().find(n=>n.getName()===name);
  if(!node)throw Error('Copy omitted crop stage '+name);
  // The Sketchfab presentation spaces its variants hundreds of units apart.
  // Author all extracted stages at one common origin. Their raw meshes are Z-up;
  // the browser turns them upright and scales them to each garden plot.
  node.setTranslation([0,0,0]);node.setRotation([0,0,0,1]);node.setScale([1,1,1]);
  scene.addChild(node);
}
let textureBytes=0;
for(const texture of result.getRoot().listTextures()){
  const image=texture.getImage();
  if(!image)throw Error('Missing texture '+texture.getName());
  const png=await sharp(image).resize({
    width:1024,height:1024,fit:'inside',withoutEnlargement:true
  }).png({compressionLevel:9}).toBuffer();
  texture.setImage(png);texture.setMimeType('image/png');
  textureBytes+=png.length;
}
await fs.mkdir(path.dirname(output),{recursive:true});
await io.write(output,result);
const verified=await io.read(output);
const stageNodes=verified.getRoot().listScenes()[0]?.listChildren()||[];
if(stageNodes.length!==3||names.some(name=>!stageNodes.some(n=>n.getName()===name)))
  throw Error('Runtime wheat did not preserve its three growth stages');
const bytes=(await fs.stat(output)).size;
const compressed=gzipSync(await fs.readFile(output),{level:9});
await fs.writeFile(output+'.gz',compressed);
console.log('PASS RUNTIME WHEAT:',JSON.stringify({
  bytes,gzipBytes:compressed.length,sourceBytes:(await fs.stat(input)).size,
  stages:stageNodes.map(n=>n.getName()),
  meshes:verified.getRoot().listMeshes().length,
  textures:verified.getRoot().listTextures().length,
  textureBytes
}));
