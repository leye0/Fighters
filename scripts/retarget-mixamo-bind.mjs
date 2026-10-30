#!/usr/bin/env node
/**
 * Fighters: world-rest-relative Mixamo retargeting, following WarConquer's
 * scripts/build-mixamo-playable.py (the verified inverse-bind method).
 *
 * A FBX2glTF node's default quaternion can be the FIRST ANIMATED FRAME.
 * It is not the Mixamo YBot bind pose. Derive bind WORLD rotations from
 * skin.inverseBindMatrices and transfer each WORLD pose delta to the
 * actual target rig, then solve target local quaternions parent-first.
 *
 * No character motion is synthesized. Locomotion translation remains
 * exclusively owned by the kinematic game simulation.
 */
import { AnimationClip, Matrix4, Quaternion, QuaternionKeyframeTrack, Vector3 } from "three";
import { mixamoBoneForRigBone } from "../src/render/character-motion.ts";

const Q = () => new Quaternion();
const types = { SCALAR: 1, VEC4: 4, MAT4: 16 };
const IDENTITY = [0, 0, 0, 1];

function parseGLB(data) {
  if (data.toString("ascii", 0, 4) !== "glTF" || data.readUInt32LE(4) !== 2 ||
      data.readUInt32LE(8) !== data.length || data.readUInt32LE(16) !== 0x4e4f534a) {
    throw Error("Invalid glTF2 binary header");
  }
  const jsonLength = data.readUInt32LE(12);
  const offset = 20 + jsonLength;
  if (data.readUInt32LE(offset + 4) !== 0x004e4942) throw Error("Missing GLB BIN chunk");
  const length = data.readUInt32LE(offset);
  if (offset + 8 + length > data.length) throw Error("Truncated GLB BIN");
  return { doc: JSON.parse(data.subarray(20, offset).toString("utf8")),
    binary: data.subarray(offset + 8, offset + 8 + length) };
}

function accessor(gltf, index) {
  const { doc, binary } = gltf;
  const a = doc.accessors[index];
  if (!a || a.componentType !== 5126 || a.sparse ||
      !types[a.type] || !Number.isSafeInteger(a.count)) {
    throw Error("Retargeter requires a dense FLOAT glTF accessor");
  }
  const view = doc.bufferViews[a.bufferView];
  if (!view || view.buffer !== 0) throw Error("Retargeter expects single-buffer GLB");
  const n = types[a.type];
  const stride = view.byteStride ?? n * 4;
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (start + (a.count - 1) * stride + n * 4 > binary.length) {
    throw Error("Retargeter accessor outside GLB BIN");
  }
  const values = [];
  for (let row = 0; row < a.count; row++) {
    const columns = [];
    for (let component = 0; component < n; component++) {
      columns.push(binary.readFloatLE(start + row * stride + component * 4));
    }
    if (!columns.every(Number.isFinite)) throw Error("Invalid animation float");
    values.push(columns);
  }
  return values;
}

function parentsOf(nodes) {
  const parents = new Array(nodes.length).fill(-1);
  for (let i = 0; i < nodes.length; i++) {
    for (const child of nodes[i].children ?? []) {
      if (parents[child] !== -1) throw Error("GLB node with two parents");
      parents[child] = i;
    }
  }
  return parents;
}

function rotationOfNode(node) {
  if (node.matrix) {
    const quat = Q();
    new Matrix4().fromArray(node.matrix).decompose(new Vector3(), quat, new Vector3());
    return quat.normalize();
  }
  return new Quaternion().fromArray(node.rotation ?? IDENTITY).normalize();
}

function worldRotations(parents, locals) {
  const world = new Array(locals.length);
  const computing = new Set();
  const solve = i => {
    if (world[i]) return world[i];
    if (computing.has(i)) throw Error("Cyclic glTF node hierarchy");
    computing.add(i);
    const parent = parents[i];
    world[i] = parent < 0 ? locals[i].clone() :
      solve(parent).clone().multiply(locals[i]).normalize();
    computing.delete(i);
    return world[i];
  };
  for (let i = 0; i < locals.length; i++) solve(i);
  return world;
}

/** glTF inverse bind matrices are inverse WORLD-space bind transforms. */
function bindWorldRotations(gltf) {
  const output = new Map();
  for (const skin of gltf.doc.skins ?? []) {
    if (skin.inverseBindMatrices === undefined) throw Error("Missing true inverse-bind matrices");
    const bind = accessor(gltf, skin.inverseBindMatrices);
    if (bind.length !== skin.joints.length) throw Error("Skin bind/joint count mismatch");
    for (let i = 0; i < skin.joints.length; i++) {
      const matrix = new Matrix4().fromArray(bind[i]).invert();
      const rot = Q();
      matrix.decompose(new Vector3(), rot, new Vector3());
      rot.normalize();
      const id = skin.joints[i];
      const previous = output.get(id);
      if (previous && previous.angleTo(rot) > 0.08) throw Error("Conflicting inverse bind pose");
      output.set(id, rot);
    }
  }
  if (output.size < 15) throw Error("No usable skin inverse bind pose");
  return output;
}

function sourceTracks(gltf) {
  const clips = (gltf.doc.animations ?? []).map(animation => {
    const tracks = new Map();
    let duration = 0;
    for (const channel of animation.channels ?? []) {
      if (channel.target.path !== "rotation") continue;
      const sampler = animation.samplers[channel.sampler];
      const times = accessor(gltf, sampler.input).map(row => row[0]);
      let frames = accessor(gltf, sampler.output);
      const interpolation = sampler.interpolation ?? "LINEAR";
      if (interpolation === "CUBICSPLINE") frames = frames.filter((_, i) => i % 3 === 1);
      else if (interpolation !== "LINEAR" && interpolation !== "STEP") throw Error("Unsupported interpolation");
      if (!times.length || times.length !== frames.length ||
          times.some((value, i) => i && value < times[i - 1])) throw Error("Bad source animation timeline");
      duration = Math.max(duration, times.at(-1));
      tracks.set(channel.target.node, { times,
        frames: frames.map(v => new Quaternion().fromArray(v).normalize()), interpolation });
    }
    return { tracks, duration };
  }).sort((a,b) => b.tracks.size - a.tracks.size);
  if (!clips.length || clips[0].duration < 0.1 || clips[0].duration > 12 ||
      clips[0].tracks.size < 15) throw Error("Missing plausible Mixamo skeletal source clip");
  return clips[0];
}

function sample(track, time) {
  const { times, frames, interpolation } = track;
  if (time <= times[0]) return frames[0].clone();
  if (time >= times.at(-1)) return frames.at(-1).clone();
  let low = 0, high = times.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (times[mid] <= time) low = mid; else high = mid;
  }
  if (interpolation === "STEP") return frames[low].clone();
  return frames[low].clone().slerp(frames[high], (time - times[low]) / (times[high] - times[low])).normalize();
}

/**
 * Retarget actual source FBX2glTF keyframes onto each target joint, without
 * subtracting source frame zero as a fictitious bind pose.
 */
export function retargetBindPoseClip(targetData, sourceData, clipName) {
  const src = parseGLB(sourceData), dst = parseGLB(targetData);
  const sn = src.doc.nodes, tn = dst.doc.nodes;
  const sp = parentsOf(sn), tp = parentsOf(tn);
  const sourceBind = bindWorldRotations(src);
  const targetBind = bindWorldRotations(dst);
  const sourceNames = new Set([...sourceBind.keys()].map(i => sn[i].name).filter(Boolean));
  const sourceIds = new Map([...sourceBind.keys()].map(i => [sn[i].name, i]));
  const pairs = new Map();
  const names = new Map();
  for (const index of targetBind.keys()) {
    const targetName = tn[index].name;
    const sourceName = mixamoBoneForRigBone(targetName, sourceNames);
    if (sourceName && sourceIds.has(sourceName)) {
      pairs.set(index, sourceIds.get(sourceName));
      names.set(index, targetName.replace(/[^A-Za-z0-9_-]/g, ""));
    }
  }
  if (pairs.size < 20) throw Error("Too few mapped joints for bind-pose retargeting: " + pairs.size);
  for (const expected of ["LeftArm", "RightArm", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]) {
    if (![...pairs.values()].some(id => new RegExp(expected + "(_[0-9]+)?$").test(sn[id].name))) {
      throw Error("Required arm/leg joint not mapped: " + expected);
    }
  }

  const { tracks: sourceMotion, duration } = sourceTracks(src);
  const sourceLocals = sn.map(rotationOfNode);
  const targetLocals = tn.map(rotationOfNode);
  const targetStaticWorld = worldRotations(tp, targetLocals);
  const samples = new Map([...pairs].map(([id]) => [id, []]));
  const frames = Math.max(8, Math.round(duration * 30) + 1);
  const times = Array.from({length: frames}, (_,i)=>duration * i / (frames - 1));
  for (const t of times) {
    const sourcePoseLocals = sourceLocals.map((q,i) => sourceMotion.has(i) ? sample(sourceMotion.get(i),t) : q.clone());
    const sourcePoseWorld = worldRotations(sp, sourcePoseLocals);
    const actualWorld = new Map();
    const solve = i => {
      if (actualWorld.has(i)) return actualWorld.get(i);
      const parentWorld = tp[i] < 0 ? Q() : solve(tp[i]);
      let local = targetLocals[i];
      if (pairs.has(i)) {
        const sourceIndex = pairs.get(i);
        // WarConquer formula: source animated WORLD delta from TRUE bind,
        // applied to target WORLD bind, then solved back into target local.
        const delta = sourcePoseWorld[sourceIndex].clone().multiply(sourceBind.get(sourceIndex).clone().invert());
        const desired = delta.multiply(targetStaticWorld[i]);
        local = parentWorld.clone().invert().multiply(desired).normalize();
        samples.get(i).push(local.toArray());
      }
      const frameWorld = parentWorld.clone().multiply(local).normalize();
      actualWorld.set(i, frameWorld);
      return frameWorld;
    };
    for (let i = 0; i < tn.length; i++) solve(i);
  }
  const angle = (a,b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;
  const shoulders = {};
  for (const side of ["LeftArm","RightArm"]) {
    const pair = [...pairs].find(([, si]) => new RegExp(side+"(_[0-9]+)?$").test(sn[si].name));
    const [ti] = pair;
    shoulders[side] = Math.round(angle(new Quaternion().fromArray(samples.get(ti)[0]), targetLocals[ti]));
  }
  // WarConquer's T-pose regression gate: an idle/walk should not leave BOTH
  // upper arms clamped to their original bind posture.
  if (/Idle|Walk/.test(clipName) && Math.min(...Object.values(shoulders)) < 10) {
    throw Error("Upper-arm T-pose regression at " + clipName + ": " + JSON.stringify(shoulders));
  }
  const jointClips = [];
  for (const [id, sampled] of samples) {
    jointClips.push(new QuaternionKeyframeTrack(".bones[" + names.get(id) + "].quaternion",
      times, sampled.flat()));
  }
  const clip = new AnimationClip(clipName, duration, jointClips);
  const audit = { mappedJoints: pairs.size, duration, frames, initialUpperArmOffsetDegrees: shoulders,
    sourceRest: "skin.inverseBindMatrices", targetRest: "target node hierarchy (WarConquer reference)",
    strategy: "WarConquer world-space inverse-bind-relative retarget (not frame-zero subtraction)",
    maxJointRotationDegrees: Math.round(Math.max(...[...samples].flatMap(([i, q]) => {
      const first = new Quaternion().fromArray(q[0]);
      return q.map(v => angle(first, new Quaternion().fromArray(v)));
    }))) };
  if (audit.maxJointRotationDegrees < 5) throw Error("No meaningful Mixamo joint motion");
  return { clip, audit };
}
