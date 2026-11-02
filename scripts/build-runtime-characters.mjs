#!/usr/bin/env node
/**
 * Extract byte-exact native keyframes for ONLY the clips used in RTS gameplay.
 *
 * Full, pinned 86-animation GLBs are preserved for motion-lab.html. No
 * retargeting, resampling, vertex processing, joint renumbering, or lossy
 * compression occurs. All retained bufferViews are copied byte-for-byte.
 *
 * Usage: node scripts/build-runtime-characters.mjs <models-dir>
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const dir=process.argv[2]||'docs/models';
const RUNTIME_CLIPS=['Idle_Loop','Walk_Loop','Jog_Fwd_Loop',
  'Punch_Jab','Hit_Chest','Death01','Sword_Idle','Sword_Attack'];
const EXPECTED_FULL_CLIPS=86;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const round4=n=>(n+3)&~3;
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');

function readGLB(bytes,filename){
 assert(bytes.toString('ascii',0,4)==='glTF',filename+': not a GLB');
 assert(bytes.readUInt32LE(4)===2,filename+': wrong glTF version');
 assert(bytes.readUInt32LE(8)===bytes.length,filename+': invalid total size');
 const jsonSize=bytes.readUInt32LE(12),jsonType=bytes.readUInt32LE(16);
 assert(jsonType===0x4e4f534a,filename+': JSON chunk absent');
 const gltf=JSON.parse(bytes.subarray(20,20+jsonSize).toString('utf8'));
 const binStart=20+jsonSize;
 assert(bytes.readUInt32LE(binStart+4)===0x004e4942,filename+': BIN absent');
 const binLength=bytes.readUInt32LE(binStart);
 assert(binStart+8+binLength===bytes.length,filename+': unexpected chunk layout');
 return {gltf,bin:bytes.subarray(binStart+8,binStart+8+binLength)};
}
function buildModel(input,output){
 const original=readFileSync(input);
 const {gltf,bin}=readGLB(original,input);
 assert(gltf.buffers?.length===1,input+': expected one embedded buffer');
 assert(!gltf.buffers[0].uri,input+': unexpected external data');
 assert(gltf.animations?.length===EXPECTED_FULL_CLIPS,input+': full source clips missing');
 const fullNames=new Set(gltf.animations.map(clip=>clip.name));
 for(const name of RUNTIME_CLIPS)assert(fullNames.has(name),input+': missing clip '+name);
 const oldSkinJoints=(gltf.skins||[]).map(skin=>[...skin.joints]);
 const oldViews=gltf.bufferViews,oldAccessors=gltf.accessors;
 assert(oldAccessors?.length>0&&oldViews?.length>0,input+': no buffer accessors');
 gltf.animations=gltf.animations.filter(clip=>RUNTIME_CLIPS.includes(clip.name));

 // Gather each referenced accessor. Materials and skeletons are untouched.
 const refs=new Set();
 const addAccessor=index=>{
  if(index===undefined||index===null)return;
  assert(Number.isInteger(index)&&oldAccessors[index],input+': invalid accessor '+index);
  refs.add(index);
 };
 for(const mesh of gltf.meshes||[])for(const primitive of mesh.primitives||[]){
  addAccessor(primitive.indices);
  for(const index of Object.values(primitive.attributes||{}))addAccessor(index);
  for(const target of primitive.targets||[])
   for(const index of Object.values(target))addAccessor(index);
  assert(!primitive.extensions?.EXT_mesh_gpu_instancing,
   input+': unsupported instancing extension');
 }
 for(const skin of gltf.skins||[])addAccessor(skin.inverseBindMatrices);
 for(const clip of gltf.animations)for(const sampler of clip.samplers){
  addAccessor(sampler.input);addAccessor(sampler.output);
 }
 for(const node of gltf.nodes||[]){
  const attributes=node.extensions?.EXT_mesh_gpu_instancing?.attributes;
  if(attributes)for(const index of Object.values(attributes))addAccessor(index);
 }
 const accessorIDs=[...refs].sort((a,b)=>a-b);
 const accessorMap=new Map(accessorIDs.map((id,i)=>[id,i]));
 const toAccessor=id=>{
  if(id===null||id===undefined)return id;
  const next=accessorMap.get(id);
  assert(next!==undefined,input+': dropped live accessor '+id);
  return next;
 };
 for(const mesh of gltf.meshes||[])for(const primitive of mesh.primitives||[]){
  if(primitive.indices!==undefined)primitive.indices=toAccessor(primitive.indices);
  for(const name of Object.keys(primitive.attributes||{}))
   primitive.attributes[name]=toAccessor(primitive.attributes[name]);
  for(const target of primitive.targets||[])
   for(const name of Object.keys(target))target[name]=toAccessor(target[name]);
 }
 for(const skin of gltf.skins||[])if(skin.inverseBindMatrices!==undefined)
  skin.inverseBindMatrices=toAccessor(skin.inverseBindMatrices);
 for(const clip of gltf.animations)for(const sampler of clip.samplers){
  sampler.input=toAccessor(sampler.input);sampler.output=toAccessor(sampler.output);
 }
 for(const node of gltf.nodes||[]){
  const attrs=node.extensions?.EXT_mesh_gpu_instancing?.attributes;
  if(attrs)for(const name of Object.keys(attrs))attrs[name]=toAccessor(attrs[name]);
 }
 gltf.accessors=accessorIDs.map(id=>oldAccessors[id]);

 const requiredViews=new Set();
 const addView=id=>{
  if(id===undefined||id===null)return;
  assert(Number.isInteger(id)&&oldViews[id],input+': invalid bufferView '+id);
  requiredViews.add(id);
 };
 for(const accessor of gltf.accessors){
  addView(accessor.bufferView);
  if(accessor.sparse){
   addView(accessor.sparse.indices.bufferView);
   addView(accessor.sparse.values.bufferView);
  }
 }
 for(const image of gltf.images||[])addView(image.bufferView);
 for(const mesh of gltf.meshes||[])for(const primitive of mesh.primitives||[])
  addView(primitive.extensions?.KHR_draco_mesh_compression?.bufferView);
 // Fail closed instead of creating a GLB containing missing extension data.
 for(const view of oldViews){
  assert(!view.extensions?.EXT_meshopt_compression,
   input+': EXT_meshopt_compression needs a separate packing path');
 }
 const viewIDs=[...requiredViews].sort((a,b)=>a-b);
 const viewMap=new Map(viewIDs.map((id,i)=>[id,i]));
 const toView=id=>{
  if(id===null||id===undefined)return id;
  const next=viewMap.get(id);
  assert(next!==undefined,input+': dropped live bufferView '+id);
  return next;
 };
 for(const accessor of gltf.accessors){
  if(accessor.bufferView!==undefined)accessor.bufferView=toView(accessor.bufferView);
  if(accessor.sparse){
   accessor.sparse.indices.bufferView=toView(accessor.sparse.indices.bufferView);
   accessor.sparse.values.bufferView=toView(accessor.sparse.values.bufferView);
  }
 }
 for(const image of gltf.images||[])if(image.bufferView!==undefined)
  image.bufferView=toView(image.bufferView);
 for(const mesh of gltf.meshes||[])for(const primitive of mesh.primitives||[]){
  const draco=primitive.extensions?.KHR_draco_mesh_compression;
  if(draco)draco.bufferView=toView(draco.bufferView);
 }
 const parts=[],newViews=[];
 let binSize=0;
 for(const id of viewIDs){
  const view=oldViews[id];
  assert(view.buffer===0,input+': external or multi-buffer view '+id);
  assert(view.byteOffset>=0&&view.byteLength>0&&view.byteOffset+view.byteLength<=bin.length,
   input+': invalid view bounds '+id);
  binSize=round4(binSize);
  const updated={...view,buffer:0,byteOffset:binSize};
  newViews.push(updated);
  parts.push({offset:binSize,data:bin.subarray(view.byteOffset,view.byteOffset+view.byteLength)});
  binSize+=view.byteLength;
 }
 const packed=Buffer.alloc(round4(binSize),0);
 for(const part of parts)part.data.copy(packed,part.offset);
 gltf.bufferViews=newViews;gltf.buffers[0].byteLength=packed.length;
 gltf.extras={...(gltf.extras||{}),fightersRuntime:true,fullSourceClipCount:86};
 // Verify every original bone index is still present and in the same order.
 for(let i=0;i<oldSkinJoints.length;i++)
  assert(JSON.stringify(gltf.skins[i].joints)===JSON.stringify(oldSkinJoints[i]),
   input+': skin joint indices changed');
 assert(gltf.animations.length===RUNTIME_CLIPS.length,input+': wrong clip subset');

 const jsonBytes=Buffer.from(JSON.stringify(gltf),'utf8');
 const jsonPadded=Buffer.alloc(round4(jsonBytes.length),0x20);jsonBytes.copy(jsonPadded);
 const total=12+8+jsonPadded.length+8+packed.length;
 const result=Buffer.allocUnsafe(total);
 result.write('glTF',0,'ascii');result.writeUInt32LE(2,4);result.writeUInt32LE(total,8);
 result.writeUInt32LE(jsonPadded.length,12);result.writeUInt32LE(0x4e4f534a,16);
 jsonPadded.copy(result,20);
 const binHeader=20+jsonPadded.length;
 result.writeUInt32LE(packed.length,binHeader);
 result.writeUInt32LE(0x004e4942,binHeader+4);
 packed.copy(result,binHeader+8);
 writeFileSync(output,result);
 const zipped=gzipSync(result,{level:9,mtime:0});
 writeFileSync(output+'.gz',zipped);
 const restored=gunzipSync(zipped);
 assert(hash(restored)===hash(result),input+': gzip integrity mismatch');
 const parsed=readGLB(restored,output+'.gz:decoded').gltf;
 assert(parsed.animations.length===RUNTIME_CLIPS.length&&
  parsed.meshes.length===gltf.meshes.length&&parsed.skins.length===gltf.skins.length,
  input+': invalid runtime output');
 console.log('RUNTIME_CHARACTER '+JSON.stringify({
  source:input,output,sourceBytes:original.length,runtimeBytes:result.length,
  runtimeGzipBytes:zipped.length,clips:RUNTIME_CLIPS,sourceClips:86,
  originalAccessors:oldAccessors.length,runtimeAccessors:accessorIDs.length,
  originalViews:oldViews.length,runtimeViews:viewIDs.length,
  bones:gltf.skins.reduce((n,skin)=>Math.max(n,skin.joints.length),0),
  sha256:hash(result),integrity:'PASS'
 }));
}
for(const name of ['human_female','human_male']){
 buildModel(join(dir,name+'.glb'),join(dir,name+'.rts.glb'));
}
