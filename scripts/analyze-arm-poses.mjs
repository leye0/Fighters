#!/usr/bin/env node
/**
 * Arm geometry audit for genuine skinned GLB characters. Compare original
 * skeleton vs baked Mixamo idle/walk at multiple gait phases.
 * Numeric output helps diagnose inward/collapsed limbs; this is NOT visual approval.
 */
import { readFile } from "node:fs/promises";
import { AnimationMixer, SkinnedMesh, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { loadRigWithoutImages } from "./embed-mixamo-gameplay.mjs";
import { GAME_MOTION_NAMES } from "../src/render/beat-character-animator.ts";
const input=process.argv.slice(2);
if(!input.length)throw Error("Usage: analyze-arm-poses.mjs <character.glb> [..]");
const fmt=n=>Number(n.toFixed(3));
for(const path of input){
 const gltf=await loadRigWithoutImages(await readFile(path));
 const scene=clone(gltf.scene);
 let skin;
 scene.traverse(n=>{if(!skin&&n instanceof SkinnedMesh)skin=n;});
 if(!skin)throw Error("Missing skinned character "+path);
 const normalize=n=>n.toLowerCase().replace(/^mixamorig:?/,"").replace(/_[0-9]+$/,"").replace(/[^a-z]/g,"");
 const bones=skin.skeleton.bones;
 const find=(...names)=>bones.find(b=>names.includes(normalize(b.name)));
 const joints={hip:find("hip","hips"),head:find("head")};
 for(const side of ["left","right"]){
   const short=side==="left"?"l":"r";
   joints[side]={shoulder:find(side+"shoulder","shoulder"+short),
     upper:find(side+"arm","upperarm"+short),
     elbow:find(side+"forearm","lowerarm"+short),
     wrist:find(side+"hand","hand"+short)};
 }
 if(!joints.hip||!joints.head||Object.values(joints.left).some(x=>!x)||Object.values(joints.right).some(x=>!x))
   throw Error("Incomplete arm hierarchy "+path+" "+bones.map(b=>b.name).join(","));
 const pos=b=>b.getWorldPosition(new Vector3());
 const meas=()=>{
   scene.updateMatrixWorld(true);
   const hip=pos(joints.hip),head=pos(joints.head);
   const width=pos(joints.left.upper).distanceTo(pos(joints.right.upper));
   const height=head.distanceTo(hip);
   const sides={};
   for(const side of ["left","right"]){
     const j=joints[side], root=pos(j.upper),elbow=pos(j.elbow),wrist=pos(j.wrist);
     const total=root.distanceTo(elbow)+elbow.distanceTo(wrist);
     const elbowFromCenter=Math.hypot(elbow.x-hip.x,elbow.z-hip.z);
     const wristFromCenter=Math.hypot(wrist.x-hip.x,wrist.z-hip.z);
     const shoulderToWrist=root.distanceTo(wrist);
     sides[side]={
       upper:fmt(root.distanceTo(elbow)),forearm:fmt(elbow.distanceTo(wrist)),
       arm:fmt(total),
       reachRatio:fmt(shoulderToWrist/Math.max(total,1e-6)),
       elbowOffset:fmt(elbowFromCenter/Math.max(width,1e-6)),
       wristOffset:fmt(wristFromCenter/Math.max(width,1e-6)),
       elbowHeightToHip:fmt((elbow.y-hip.y)/Math.max(height,1e-6)),
       wristHeightToHip:fmt((wrist.y-hip.y)/Math.max(height,1e-6))
     };
   }
   return {width:fmt(width),torso:fmt(height),...sides};
 };
 const output={file:path,rest:meas(),samples:[]};
 const mixer=new AnimationMixer(scene);
 for(const name of [GAME_MOTION_NAMES.idle,GAME_MOTION_NAMES.walk,GAME_MOTION_NAMES.walkFeminine,GAME_MOTION_NAMES.walkBackward]){
   const clip=gltf.animations.find(a=>a.name===name);
   if(!clip)continue;
   for(const t of [0,0.125,0.25,0.375,0.5,0.625,0.75,0.875]){
     mixer.stopAllAction();mixer.time=0;
     mixer.clipAction(clip).reset().play();mixer.setTime(t*clip.duration);
     output.samples.push({clip:name,phase:t,...meas()});
   }
 }
 console.log(JSON.stringify(output));
}
