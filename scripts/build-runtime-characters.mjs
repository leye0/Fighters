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

 // Source Quaternius GLBs use a small number of HUGE bufferViews,
 // with 30,000+ tightly packed animation accessors inside them. Keeping the
 // original view whole preserves almost all unwanted animation bytes.
 // Each retained accessor MUST therefore be packed at byte-range granularity.
 const parts=[],newViews=[];
 let binSize=0;
 const componentBytes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
 const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
 function copyBytes(template,start,length){
  assert(Number.isInteger(start)&&Number.isInteger(length)&&length>0&&
   start>=0&&start+length<=bin.length,input+': referenced data out of bounds');
  binSize=round4(binSize);
  const index=newViews.length;
  newViews.push({...template,buffer:0,byteOffset:binSize,byteLength:length});
  parts.push({offset:binSize,data:bin.subarray(start,start+length)});
  binSize+=length;
  return index;
 }
 const fullViewMap=new Map();
 function preserveWholeView(id){
  if(id===undefined||id===null)return id;
  if(fullViewMap.has(id))return fullViewMap.get(id);
  const view=oldViews[id];
  assert(view&&view.buffer===0,input+': unexpected buffer reference '+id);
  const next=copyBytes(view,view.byteOffset||0,view.byteLength);
  fullViewMap.set(id,next);
  return next;
 }
 for(const accessor of gltf.accessors){
  if(accessor.bufferView!==undefined&&accessor.bufferView!==null){
   const view=oldViews[accessor.bufferView];
   assert(view&&view.buffer===0,input+': invalid accessor view');
   const componentSize=componentBytes[accessor.componentType];
   const quantity=components[accessor.type];
   assert(componentSize&&quantity&&accessor.count>0,
    input+': invalid accessor element layout');
   // Special glTF 4-byte matrix column alignment only affects tiny integer
   // matrices. Their full view is retained rather than risking corruption.
   const specialMatrix=accessor.type.startsWith('MAT')&&componentSize<4;
   if(specialMatrix){
    accessor.bufferView=preserveWholeView(accessor.bufferView);
   }else{
    const itemSize=componentSize*quantity;
    const stride=view.byteStride||itemSize;
    assert(stride>=itemSize,input+': undersized accessor stride');
    const countBytes=(accessor.count-1)*stride+itemSize;
    const offset=(view.byteOffset||0)+(accessor.byteOffset||0);
    assert(offset+countBytes<=(view.byteOffset||0)+view.byteLength,
     input+': accessor escapes its source bufferView');
    accessor.bufferView=copyBytes(view,offset,countBytes);
    accessor.byteOffset=0;
   }
  }
  if(accessor.sparse){
   accessor.sparse.indices.bufferView=preserveWholeView(
    accessor.sparse.indices.bufferView);
   accessor.sparse.values.bufferView=preserveWholeView(
    accessor.sparse.values.bufferView);
  }
 }
 for(const image of gltf.images||[])if(image.bufferView!==undefined)
  image.bufferView=preserveWholeView(image.bufferView);
 for(const mesh of gltf.meshes||[])for(const primitive of mesh.primitives||[]){
  const draco=primitive.extensions?.KHR_draco_mesh_compression;
  if(draco)draco.bufferView=preserveWholeView(draco.bufferView);
 }
 const packed=Buffer.alloc(round4(binSize),0);
 for(const part of parts)part.data.copy(packed,part.offset);
 gltf.bufferViews=newViews;
 gltf.buffers[0].byteLength=packed.length;
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
  originalViews:oldViews.length,runtimeViews:newViews.length,
  bones:gltf.skins.reduce((n,skin)=>Math.max(n,skin.joints.length),0),
  sha256:hash(result),integrity:'PASS'
 }));
}
for(const name of ['human_female','human_male']){
 buildModel(join(dir,name+'.glb'),join(dir,name+'.rts.glb'));
}
