#!/usr/bin/env node
/** Headless rig+motion verification against the *actual* browser GLB binaries.
 * No GPU, textures or browser screenshot is required. Usage:
 * node scripts/check-character-motion.mjs claudia.glb realistic-man.glb
 */
import { readFile } from "node:fs/promises";
import { Quaternion, SkinnedMesh } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { playEmbeddedMotion, retargetEmbeddedMotion } from "../src/render/character-motion.ts";

function rig(scene) {
  let mesh;
  scene.traverse(object => { if (!mesh && object instanceof SkinnedMesh) mesh = object; });
  if (!mesh) throw Error("Missing real rig");
  return mesh;
}

async function load(file) {
  const loader = new GLTFLoader();
  const bytes = await readFile(file);
  // Remove only material/image descriptions from the in-memory *diagnostic*
  // copy: Node lacks WebP decoding, whereas the skinned mesh, BIN geometry,
  // skeleton and animation channels are byte-for-byte the acquired asset.
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) delete primitive.material;
  }
  delete json.materials;
  delete json.textures;
  delete json.images;
  delete json.samplers;
  json.extensionsUsed = (json.extensionsUsed ?? []).filter(x => !x.includes("texture"));
  json.extensionsRequired = (json.extensionsRequired ?? []).filter(x => !x.includes("texture"));
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(padded);
  const binaryStart = 20 + jsonLength;
  const binaryTail = bytes.subarray(binaryStart);
  const glb = Buffer.alloc(20 + padded.length + binaryTail.length);
  bytes.copy(glb, 0, 0, 12);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  bytes.copy(glb, 16, 16, 20); // JSON chunk tag
  padded.copy(glb, 20);
  binaryTail.copy(glb, 20 + padded.length);
  return loader.parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "");
}

const [femalePath, malePath] = process.argv.slice(2);
if (!femalePath || !malePath) throw Error("Supply two downloaded GLBs");
const [female, male] = await Promise.all([load(femalePath), load(malePath)]);
const animation = male.animations[0];
if (!animation || animation.duration <= 0) throw Error("Male source has no keyed animation");
const sourceNames = new Set(rig(male.scene).skeleton.bones.map(bone => bone.name));
const target = rig(female.scene);
const { clip: retargeted, mappedJoints, mixer } = retargetEmbeddedMotion(
  female.scene, male.scene, animation);
if (retargeted.tracks.length < 15) throw Error("Retarget yielded insufficient animation tracks");
const varying = retargeted.tracks.filter(track => track.values.some(
  (value, i) => i >= track.getValueSize() && Math.abs(value - track.values[i % track.getValueSize()]) > 0.001));
if (varying.length < 5) throw Error(`Only ${varying.length} animated joint tracks vary`);
mixer.update(Math.min(0.5, animation.duration / 3));
if (!target.skeleton.bones.every(bone => Number.isFinite(bone.quaternion.w))) {
  throw Error("Animation produced invalid quaternions");
}
const maleClone = cloneSkeleton(male.scene);
const maleRig = rig(maleClone);
const before = maleRig.skeleton.bones.map(bone => bone.quaternion.clone());
const maleMixer = playEmbeddedMotion(maleClone, animation);
maleMixer.update(Math.min(0.5, animation.duration / 3));
const changedMaleBones = maleRig.skeleton.bones.filter((bone, i) =>
  bone.quaternion.angleTo(before[i]) > 0.001).length;
if (changedMaleBones < 5) throw Error(`Male source clip animated only ${changedMaleBones} bones`);
const hipTrack = animation.tracks.find(track => track.name.includes("Hips") && track.name.endsWith(".quaternion"));
let hipTurnDegrees = null;
if (hipTrack) {
  const values = hipTrack.values;
  const first = new Quaternion().fromArray(values, 0);
  const last = new Quaternion().fromArray(values, values.length - 4);
  hipTurnDegrees = Math.round(first.angleTo(last) * 180 / Math.PI);
}
console.log(JSON.stringify({ femaleJoints: target.skeleton.bones.length, sourceJoints: sourceNames.size,
  sourceClip: animation.name, duration: animation.duration, mappedJoints,
  retargetedTracks: retargeted.tracks.length, varyingTracks: varying.length,
  changedMaleBones, hipTurnDegrees }, null, 2));
