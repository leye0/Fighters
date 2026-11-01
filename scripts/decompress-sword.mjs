#!/usr/bin/env node
// Decode Quaternius-compatible CC0 sword bufferViews at BUILD time, in place.
// Runtime URL and GLTF scene/node names stay unchanged, so cached game scripts
// can also load the sword without MeshoptDecoder.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer';

const file='docs/models/equipment.sword.arming.default.gltf';
const source=JSON.parse(readFileSync(file,'utf8'));
if(!source.extensionsRequired?.includes('EXT_meshopt_compression'))
  throw Error('Input sword was not Meshopt-compressed; check pinned upstream version.');
const buffers=source.buffers.map(b=>{
  // EXT_meshopt_compression allows a fallback buffer with no URI. The
  // compressed views use the extension's buffer/offset instead of that dummy.
  if(!b.uri)return Buffer.alloc(0);
  if(b.uri.startsWith('data:'))throw Error('Sword source buffer must use a local binary URI');
  const fileName=resolve(dirname(file),b.uri);
  const bytes=readFileSync(fileName);
  if(bytes.length<b.byteLength)throw Error('Short source buffer '+fileName);
  return bytes;
});
await MeshoptDecoder.ready;
let offset=0,decoded=0;
const parts=[];
for(const view of source.bufferViews){
  const ext=view.extensions?.EXT_meshopt_compression;
  let bytes;
  if(ext){
    const compressed=buffers[ext.buffer].subarray(ext.byteOffset??0,(ext.byteOffset??0)+ext.byteLength);
    bytes=new Uint8Array(ext.count*ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(bytes,ext.count,ext.byteStride,compressed,ext.mode,ext.filter??'NONE');
    if(ext.mode==='ATTRIBUTES')view.byteStride=ext.byteStride;
    else delete view.byteStride;
    delete view.extensions.EXT_meshopt_compression;
    if(Object.keys(view.extensions).length===0)delete view.extensions;
    decoded++;
  } else {
    const sourceBytes=buffers[view.buffer];
    const start=view.byteOffset??0;
    if(start+view.byteLength>sourceBytes.length)
      throw Error('Uncompressed bufferView references an absent fallback');
    bytes=sourceBytes.subarray(start,start+view.byteLength);
  }
  const pad=(4-offset%4)%4;
  if(pad){parts.push(Buffer.alloc(pad));offset+=pad;}
  view.buffer=0;
  view.byteOffset=offset;
  view.byteLength=bytes.length;
  parts.push(Buffer.from(bytes));
  offset+=bytes.length;
}
if(!decoded)throw Error('No compressed sword bufferViews decoded');
const binary=Buffer.concat(parts);
source.buffers=[{uri:'equipment.sword.arming.default.bin',byteLength:binary.length}];
source.extensionsUsed=(source.extensionsUsed??[]).filter(e=>e!=='EXT_meshopt_compression');
source.extensionsRequired=(source.extensionsRequired??[]).filter(e=>e!=='EXT_meshopt_compression');
if(!source.extensionsUsed.length)delete source.extensionsUsed;
if(!source.extensionsRequired.length)delete source.extensionsRequired;
writeFileSync(resolve(dirname(file),source.buffers[0].uri),binary);
writeFileSync(file,JSON.stringify(source));
const roundTrip=JSON.parse(readFileSync(file,'utf8'));
if(roundTrip.extensionsUsed?.includes('EXT_meshopt_compression')||
   roundTrip.bufferViews.some(v=>v.extensions?.EXT_meshopt_compression))
  throw Error('Compressed geometry remains in deployed sword');
console.log('SWORD DECOMPRESS PASS: '+decoded+' views, '+binary.length+' bytes, zero runtime Meshopt dependency');
