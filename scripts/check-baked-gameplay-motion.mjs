#!/usr/bin/env node
/** Verify that *every* baked game clip actually animates character bones.
 * It inspects and plays real GLB assets without a GPU or WebP decoder.
 */
import { readFile } from "node:fs/promises";
import { AnimationMixer, SkinnedMesh, Vector3 } from "three";
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

    // Character-specific 3D skeletal anatomy gate. A clip that moves 20 bones
    // yet makes the avatar lie horizontally MUST fail (reported on iPhone).
    // Compare head/hip/feet to the same rig's own bind/rest proportions, so
    // differing character heights and exporter unit scales are handled.
    const allBones = skinned.skeleton.bones;
    const norm = name => name.toLowerCase().replace(/^mixamorig:?/, "")
      .replace(/_[0-9]+$/, "").replace(/[^a-z]/g, "");
    const pick = expected => allBones.find(bone => expected.includes(norm(bone.name)));
    const head = pick(["head"]), hips = pick(["hip", "hips"]);
    const footL = pick(["leftfoot", "footl"]), footR = pick(["rightfoot", "footr"]);
    if (!head || !hips || !footL || !footR) {
      throw Error("Anatomy QA missing head, pelvis or both feet in " + path);
    }
    const pos = bone => bone.getWorldPosition(new Vector3());
    const elevations = () => {
      cloned.updateMatrixWorld(true);
      const h = pos(head).y, p = pos(hips).y;
      const f = (pos(footL).y + pos(footR).y) / 2;
      return { torso: h - p, legs: p - f };
    };
    const torsoDirection = () => {
      cloned.updateMatrixWorld(true);
      return pos(head).sub(pos(hips));
    };
    const bind = elevations();
    if (bind.torso <= 0 || bind.legs <= 0) {
      throw Error("Original character rig lacks upright anatomy: " + path);
    }
    const original = skinned.skeleton.bones.map(bone => bone.quaternion.clone());
    const mixer = new AnimationMixer(cloned);
    mixer.clipAction(clip).play();
    mixer.update(clip.duration * 0.4);

    const anatomy = [];
    if (/Idle|Walk|Turn/.test(spec.name)) {
      for (const fraction of [0, 0.25, 0.5, 0.75]) {
        mixer.setTime(clip.duration * fraction);
        const pose = elevations();
        const torsoRatio = pose.torso / bind.torso;
        const legRatio = pose.legs / bind.legs;
        const torsoVector = torsoDirection();
        const leanRatio = Math.hypot(torsoVector.x, torsoVector.z) /
          Math.max(1e-9, torsoVector.y);
        anatomy.push({ fraction, torsoRatio: Number(torsoRatio.toFixed(2)),
          legRatio: Number(legRatio.toFixed(2)),
          torsoLean: Number(leanRatio.toFixed(2)) });
        // A moving avatar whose head is almost level with its hips is not
        // an acceptable upright gait, regardless of how many bones animate.
        if (/Idle|Walk/.test(spec.name) && (leanRatio > 1 || !Number.isFinite(leanRatio))) {
          throw Error("EXCESSIVE BACK/FRONT LEAN: " + spec.name + " on " + path +
            " at " + fraction + " lean=" + leanRatio.toFixed(2));
        }
        if (torsoRatio < 0.5 || legRatio < 0.5) {
          throw Error("BROKEN ANATOMY: " + spec.name + " on " + path +
            " at " + fraction + " torso/legs ratios " +
            torsoRatio.toFixed(2) + "/" + legRatio.toFixed(2));
        }
      }
    }
    const changedBones = skinned.skeleton.bones.filter((bone, i) =>
      bone.quaternion.angleTo(original[i]) > 0.001).length;
    if (changedBones < 5) {
      throw Error(`${spec.name} has no real skeleton playback (${changedBones} bones): ${path}`);
    }
    // A looped walk sampled after 30 full cycles must have exactly the same
    // posture as its first cycle; any cumulative bone drift is a bug.
    if (spec.name === "Fighters_Mixamo_Walk_Standard") {
      const posture = () => {
        const torso = torsoDirection();
        return [torso.x, torso.y, torso.z];
      };
      mixer.setTime(clip.duration * 0.35);
      const early = posture();
      mixer.setTime(clip.duration * 30.35);
      const late = posture();
      const error = Math.hypot(...early.map((v,i) => v-late[i]));
      const length = Math.hypot(...early);
      if (error / Math.max(length, 1e-6) > 0.02) {
        throw Error("WALK RIG POSE DRIFT after 30 loops: " + path +
          " relative torso error=" + (error/length).toFixed(3));
      }
    }
    audited.push({ animation: spec.name, seconds: Number(clip.duration.toFixed(3)), changedBones, anatomy });
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
