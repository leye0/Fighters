#!/usr/bin/env node
/** Inspect actual authored Mixamo knee poses, not just track/keyframe counts.
 * This is diagnostic only; no source FBX and no generated animation.
 */
import { readFile } from "node:fs/promises";
import { AnimationMixer, SkinnedMesh, Vector3 } from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { loadRigWithoutImages } from "./embed-mixamo-gameplay.mjs";
import { GAME_MOTION_NAMES, makeArcadeJumpClip } from "../src/render/beat-character-animator.ts";

const file = process.argv[2];
if (!file) throw Error("Usage: node scripts/analyze-jump-poses.mjs public/models/claudia.glb");
const gltf = await loadRigWithoutImages(await readFile(file));
const animated = cloneSkeleton(gltf.scene);
let skinned;
animated.traverse(object => { if (!skinned && object instanceof SkinnedMesh) skinned = object; });
if (!skinned) throw Error("No skinned mesh");
const norm = n => n.toLowerCase().replace(/^mixamorig:?/,"").replace(/_[0-9]+$/,"").replace(/[^a-z]/g,"");
const bones = skinned.skeleton.bones;
const find = (...names) => bones.find(b => names.includes(norm(b.name)));
const limbs = ["left","right"].map(side => {
 const short=side==="left"?"l":"r";
 // Renderpeople Claudia/Carla: upperleg_l, lowerleg_l, foot_l;
 // Mixamo/Realistic Man: LeftUpLeg, LeftLeg, LeftFoot.
 const hip = find(side+"upleg","upperleg"+short);
 const knee = find(side+"leg","lowerleg"+short);
 const foot = find(side+"foot","foot"+short);
 if (!hip || !knee || !foot) throw Error("Missing anatomical joint for " + side + " among: " +
   bones.map(b => b.name).join(", "));
 return {side, hip,knee,foot};
});
const head = find("head"), pelvis = find("hips", "hip");
if (!head || !pelvis) throw Error("Missing head or hips");
const mixer = new AnimationMixer(animated);
function pose(clip, frac) {
 mixer.stopAllAction(); mixer.time = 0;
 mixer.clipAction(clip).reset().play(); mixer.setTime(frac*clip.duration);
 animated.updateMatrixWorld(true);
 const kneeBends = limbs.map(({hip,knee,foot})=>{
   const k=knee.getWorldPosition(new Vector3());
   const upper=hip.getWorldPosition(new Vector3()).sub(k).normalize();
   const lower=foot.getWorldPosition(new Vector3()).sub(k).normalize();
   return Math.round((180-upper.angleTo(lower)*180/Math.PI)*10)/10;
 });
 const h = head.getWorldPosition(new Vector3()), p = pelvis.getWorldPosition(new Vector3());
 const torsoLean = Math.round(Math.hypot(h.x-p.x,h.z-p.z)/Math.max(0.01,h.y-p.y)*100)/100;
 return {fraction:frac,sec:Math.round(frac*clip.duration*100)/100,knees:kneeBends,
   maxBend:Math.max(...kneeBends),meanBend:Math.round((kneeBends[0]+kneeBends[1])*5)/10,
   torsoLean};
}
const names=[GAME_MOTION_NAMES.idle,GAME_MOTION_NAMES.jump,GAME_MOTION_NAMES.fall];
const result={character:file};
for(const name of names){
 const clip=gltf.animations.find(x=>x.name===name);if(!clip)throw Error("Missing "+name);
 result[name]={duration:clip.duration,poses:Array.from({length:25},(_,i)=>pose(clip,i/24))};
}
const raw = result[GAME_MOTION_NAMES.jump].poses;
const sourceJump = gltf.animations.find(x=>x.name===GAME_MOTION_NAMES.jump);
const retimed = makeArcadeJumpClip(sourceJump);
result.arcadeJump={duration:retimed.duration,poses:Array.from({length:49},
  (_,i)=>pose(retimed,i/48))};
const maximumBend = poses=>Math.max(...poses.flatMap(p=>p.knees));
result.rawMaxKneeBend=maximumBend(raw);
result.arcadeMaxKneeBend=maximumBend(result.arcadeJump.poses);
console.log(JSON.stringify(result));
if(result.rawMaxKneeBend < 100)throw Error("Expected documented severe source tuck in Jump.fbx");
if(result.arcadeMaxKneeBend > 80)throw Error(
  "Arcade jump still contains excessive airborne knee bend: "+result.arcadeMaxKneeBend);
if(result.rawMaxKneeBend-result.arcadeMaxKneeBend < 40)
  throw Error("Retimed real jump did not adequately reduce knee tuck");
