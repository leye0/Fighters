#!/usr/bin/env node
/**
 * Produce compact RTS character variants with glTF Transform, preserving
 * native 65-joint skeleton, full model, and original animation keyframes.
 * The full 86-clip original models remain untouched for motion-lab.html.
 */
import {NodeIO} from '@gltf-transform/core';
import {prune,textureCompress} from '@gltf-transform/functions';
import {EXTTextureWebP} from '@gltf-transform/extensions';
import sharp from 'sharp';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const dir=process.argv[2]||'docs/models';
const RUNTIME_CLIPS=['Idle_Loop','Walk_Loop','Jog_Fwd_Loop',
  'Punch_Jab','Hit_Chest','Death01','Sword_Idle','Sword_Attack',
  'Farm_Harvest','Farm_PlantSeed'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const io=new NodeIO().registerExtensions([EXTTextureWebP]);

function fingerprintAnimation(animation){
 return animation.listSamplers().map(sampler=>{
  const input=sampler.getInput(),output=sampler.getOutput();
  const digest=arr=>{
   if(!arr)return '';
   return hash(Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength));
  };
  return {
   inCount:input?.getCount(),outCount:output?.getCount(),
   inHash:digest(input?.getArray()),outHash:digest(output?.getArray())
  };
 });
}
for(const gender of ['female','male']){
 const original=join(dir,'human_'+gender+'.glb');
 const output=join(dir,'human_'+gender+'.rts.glb');
 const doc=await io.read(original);
 const root=doc.getRoot();
 const clips=root.listAnimations();
 assert(clips.length===86,'Full 86 native clips not present in '+original);
 const nativeNames=new Set(clips.map(clip=>clip.getName()));
 for(const name of RUNTIME_CLIPS)
  assert(nativeNames.has(name),'Missing native clip '+name);
 const retained=clips.filter(clip=>RUNTIME_CLIPS.includes(clip.getName()));
 const before=new Map(retained.map(clip=>[clip.getName(),fingerprintAnimation(clip)]));
 console.log('SOURCE_TEXTURE_BREAKDOWN '+JSON.stringify({
  gender,
  textures:root.listTextures().map(t=>({name:t.getName(),size:t.getImage()?.byteLength||0,
    dimensions:t.getSize?.(),mime:t.getMimeType?.()})),
  meshCount:root.listMeshes().length,
  skinCount:root.listSkins().length
 }));
 const oldSkins=root.listSkins().map(skin=>
  skin.listJoints().map(joint=>joint.getName()));
 assert(oldSkins.length>0&&Math.max(...oldSkins.map(x=>x.length))>=20,
  'Missing native skeleton: '+original);
 for(const animation of clips)if(!RUNTIME_CLIPS.includes(animation.getName())){
  // Animation.dispose() removes only the animation itself. Explicitly detach
  // its channels and samplers so all unneeded keyframe accessors become
  // unreferenced, allowing prune() to reclaim their large binary arrays.
  for(const channel of [...animation.listChannels()])channel.dispose();
  for(const sampler of [...animation.listSamplers()])sampler.dispose();
  animation.dispose();
 }
 await doc.transform(
  prune(),
  // At isometric RTS scale, 2048px source textures are excessive. The full
  // 86-clip models retain their original 2048px PNGs for the motion lab.
  // This only converts runtime material images; bone/keyframe arrays remain
  // byte-for-byte identical, as verified below.
  textureCompress({
   encoder:sharp,targetFormat:'webp',resize:[1024,1024],
   quality:88,effort:5
  })
 );
 console.log('RUNTIME_TEXTURES '+JSON.stringify({
  gender,
  textures:root.listTextures().map(t=>({
   name:t.getName(),bytes:t.getImage()?.byteLength||0,
   size:t.getSize?.(),mime:t.getMimeType?.()
  }))
 }));
 const reduced=root.listAnimations();
 assert(reduced.length===RUNTIME_CLIPS.length,'Incorrect runtime clip count');
 for(const clip of reduced)
  assert(JSON.stringify(fingerprintAnimation(clip))===JSON.stringify(before.get(clip.getName())),
   'Original keyframes changed: '+clip.getName());
 const newSkins=root.listSkins().map(skin=>skin.listJoints().map(j=>j.getName()));
 assert(JSON.stringify(oldSkins)===JSON.stringify(newSkins),
  'Native joint hierarchy or ordering changed');
 const packed=Buffer.from(await io.writeBinary(doc));
 const originalBytes=readFileSync(original).byteLength;
 writeFileSync(output,packed);
 const zipped=gzipSync(packed,{level:9,mtime:0});
 writeFileSync(output+'.gz',zipped);
 assert(hash(gunzipSync(zipped))===hash(packed),'gzip roundtrip mismatch');
 // A second independent decode catches GLB serialization corruption before deploy.
 const reopened=await io.readBinary(packed);
 assert(reopened.getRoot().listAnimations().length===RUNTIME_CLIPS.length,
  'Runtime GLB fails decode');
 assert(reopened.getRoot().listMeshes().length===root.listMeshes().length,
  'Runtime mesh changed');
 assert(reopened.getRoot().listSkins().length===root.listSkins().length,
  'Runtime skin changed');
 const currentSkins=reopened.getRoot().listSkins().map(skin=>
  skin.listJoints().map(j=>j.getName()));
 assert(JSON.stringify(currentSkins)===JSON.stringify(oldSkins),
  'Serialized GLB skeleton mismatch');
 // Reject a fake optimization before it can replace the known-working build.
 console.log('RUNTIME_SIZE_DIAGNOSTIC '+JSON.stringify({gender,originalBytes,packed:packed.length,zipped:zipped.length,accessors:root.listAccessors().length}));
 assert(packed.length<originalBytes*.6,
  'Optimized model is unexpectedly large, not safe to deploy');
 console.log('RUNTIME_CHARACTER '+JSON.stringify({
  input:original,output,originalBytes,runtimeBytes:packed.length,
  gzipBytes:zipped.length,originalClips:86,runtimeClips:reduced.length,
  nativeJointCount:Math.max(...oldSkins.map(x=>x.length)),
  sha256:hash(packed),keyframes:'byte_exact',integrity:'PASS'
 }));
}
