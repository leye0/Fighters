#!/usr/bin/env node
// Pack the SHA-pinned free Quaternius Standard Ranger glTF without modifying
// its geometry, skin weights, joint order, inverse bind matrices or animations.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
import sharp from 'sharp';

const [source,textureDir,destination]=process.argv.slice(2);
assert(source&&textureDir&&destination,
  'Usage: pack-female-ranger.mjs source.gltf textures-dir output.glb');
const json=JSON.parse(readFileSync(source,'utf8'));
assert.equal(json.skins.length,1);
assert.equal(json.skins[0].joints.length,65);
assert.equal(json.meshes.length,9);
assert.equal(json.buffers.length,1);
assert.equal(json.images.length,6);
assert(!json.animations?.length,'Ranger outfit must use the native character clips');
const sourceBin=readFileSync(join(dirname(source),json.buffers[0].uri));
assert.equal(sourceBin.length,json.buffers[0].byteLength);
const pieces=[sourceBin];
let offset=sourceBin.length;
const pad=()=>{const count=(4-offset%4)%4;if(count){pieces.push(Buffer.alloc(count));offset+=count;}};
for(let i=0;i<json.images.length;i++){
  const image=json.images[i];
  assert.equal(image.mimeType,'image/png');
  pad();
  const file=join(textureDir,basename(image.uri));
  // The source contains 4K PNG textures. Resize only their raster data to
  // bound mobile downloads; never mutate or recolor their appearance.
  const maxWidth=image.name.startsWith('T_Ranger_')?2048:1024;
  const webp=await sharp(file).resize({width:maxWidth,withoutEnlargement:true})
    .webp({quality:80,effort:6}).toBuffer();
  const bufferView=json.bufferViews.push({buffer:0,byteOffset:offset,
    byteLength:webp.length})-1;
  pieces.push(webp);offset+=webp.length;
  delete image.uri;
  image.mimeType='image/webp';
  image.bufferView=bufferView;
}
for(const texture of json.textures){
  assert(Number.isInteger(texture.source));
  texture.extensions={...texture.extensions,EXT_texture_webp:{source:texture.source}};
  delete texture.source;
}
json.extensionsUsed=[...new Set([...(json.extensionsUsed||[]),'EXT_texture_webp'])];
pad();
json.buffers=[{byteLength:offset}];
const jsonBytes=Buffer.from(JSON.stringify(json),'utf8');
const jsonPadded=Buffer.alloc(Math.ceil(jsonBytes.length/4)*4,0x20);
jsonBytes.copy(jsonPadded);
const bin=Buffer.concat(pieces);
assert.equal(bin.length,offset);
const header=Buffer.alloc(12);
header.write('glTF',0,'ascii');
header.writeUInt32LE(2,4);
header.writeUInt32LE(12+8+jsonPadded.length+8+bin.length,8);
const jsonHeader=Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonPadded.length,0);
jsonHeader.write('JSON',4,'ascii');
const binHeader=Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length,0);
binHeader.write('BIN\0',4,'ascii');
writeFileSync(destination,Buffer.concat([header,jsonHeader,jsonPadded,binHeader,bin]));
console.log('Packed untouched 65-bone Ranger skin with optimized textures: '+destination);
