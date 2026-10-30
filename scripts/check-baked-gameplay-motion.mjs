#!/usr/bin/env node
/** Verify that *every* baked game clip actually animates character bones.
 * It inspects and plays real GLB assets without a GPU or WebP decoder.
 */
import { readFile } from "node:fs/promises";
import { AnimationMixer, SkinnedMesh } from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { GAME_MOTIONS, loadRigWithoutImages } from "./embed-mixamo-gameplay.mjs";
import { BeatCharacterAnimator } from "../src/render/beat-character-animator.ts";
import { Group } from "three";

const paths = process.argv.slice(2);
if (paths.length === 0) throw Error("Supply baked game character GLB paths");
for (const path of paths) {
  const gltf = await loadRigWithoutImages(await readFile(path));
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  const audited = [];
  for (const spec of GAME_MOTIONS) {
    const clip = clips.get(spec.name);
    if (!clip || clip.duration <= 0 || clip.tracks.length < 15) {
      throw Error(`Missing or empty real animation ${spec.name} in ${path}`);
    }
    const cloned = cloneSkeleton(gltf.scene);
    let skinned;
    cloned.traverse(node => { if (!skinned && node instanceof SkinnedMesh) skinned = node; });
    if (!skinned) throw Error("Source character lacks rig");
    const original = skinned.skeleton.bones.map(bone => bone.quaternion.clone());
    const mixer = new AnimationMixer(cloned);
    mixer.clipAction(clip).play();
    mixer.update(clip.duration * 0.4);
    const changedBones = skinned.skeleton.bones.filter((bone, i) =>
      bone.quaternion.angleTo(original[i]) > 0.001).length;
    if (changedBones < 5) {
      throw Error(`${spec.name} has no real skeleton playback (${changedBones} bones): ${path}`);
    }
    audited.push({ animation: spec.name, seconds: Number(clip.duration.toFixed(3)), changedBones });
  }
  // Exercise the actual runtime state machine, not merely a free animation
  // mixer: walk, then play an entire authored half-turn before changing yaw.
  const outer = new Group();
  const runtimeRig = cloneSkeleton(gltf.scene);
  outer.add(runtimeRig);
  const controller = new BeatCharacterAnimator(outer, runtimeRig, gltf.animations, 1,
    path.includes("claudia") || path.includes("carla"));
  const initial = { id: "qa", team: "qa", alive: true, facing: 1, xMm: 0, depthMm: 0,
    heightMm: 0, supportingPlatformId: "ground", verticalVelocityMmPerTick: 0,
    speedMmPerTick: 40, jumpSpeedMmPerTick: 200, targetId: null };
  controller.update(initial, { ...initial, xMm: 40 }, 0.04);
  const turned = { ...initial, xMm: 40, facing: -1 };
  for (let i = 0; i < 45; i++) controller.update(initial, turned, 0.05);
  if (Math.abs(outer.rotation.y + Math.PI / 2) > 0.000001) {
    throw Error("Runtime character did not finish the Mixamo left turn");
  }
  controller.dispose();
  console.log(JSON.stringify({ character: path, clips: audited }, null, 2));
}
