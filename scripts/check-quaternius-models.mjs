#!/usr/bin/env node
/** Structural and 3D pose validation of the actual, independently skinned GLBs. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AnimationMixer, Box3, Group, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { canonicalBone, encodeGLB, parseGLB } from "./build-quaternius-animations.mjs";

const EXPECTED = ["claudia", "carla", "realistic-man"];
const MOTIONS = ["UAL1_Idle_Loop", "UAL1_Walk_Loop", "UAL1_Jump_Start",
  "UAL1_Jump_Loop", "UAL1_Jump_Land", "UAL1_Punch_Cross", "UAL2_Melee_Hook",
  "ACCAD_Front_Kick", "ACCAD_Roundhouse_Kick"];
const SOURCE = "fighters-quaternius-accad-own-skin-v2";
function requireCondition(condition, message) { if (!condition) throw Error(message); }

async function withoutTextures(binary) {
  const parsed = parseGLB(binary);
  const doc = structuredClone(parsed.doc);
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives ?? [])
    delete primitive.material;
  for (const property of ["images", "textures", "samplers", "materials"]) delete doc[property];
  doc.extensionsUsed = (doc.extensionsUsed ?? []).filter(ext => !/texture|basisu|webp/i.test(ext));
  doc.extensionsRequired = (doc.extensionsRequired ?? []).filter(ext => !/texture|basisu|webp/i.test(ext));
  const bare = encodeGLB(doc, parsed.bin);
  const data = bare.buffer.slice(bare.byteOffset, bare.byteOffset + bare.byteLength);
  return new GLTFLoader().parseAsync(data, "");
}

async function checkCharacter(file, name) {
  const raw = await readFile(file);
  const parsed = parseGLB(raw);
  const { doc } = parsed;
  requireCondition(doc.asset?.extras?.fightersMotionSource?.strategy === SOURCE,
    name + ": unknown animation source");
  requireCondition(doc.asset.extras.fightersMotionSource.character === name,
    name + ": another character's animations have been substituted");
  requireCondition(doc.animations.length === 88 &&
    new Set(doc.animations.map(a => a.name)).size === 88,
    name + ": incomplete 88-clip pack");
  requireCondition(!doc.animations.some(a => /mixamo|ybot|adobe/i.test(JSON.stringify(a))),
    name + ": legacy animation remains");
  const joints = new Set(doc.skins.flatMap(skin => skin.joints));
  for (const clip of doc.animations) {
    requireCondition(clip.extras?.rigTransfer === SOURCE && clip.channels.length >= 20,
      name + ": missing clip provenance or incomplete skeleton: " + clip.name);
    requireCondition(clip.extras?.license === (clip.name.startsWith("ACCAD_") ? "CC-BY-3.0" : "CC0-1.0"),
      name + ": inaccurate licence on " + clip.name);
    requireCondition(clip.channels.every(channel => channel.target.path === "rotation" &&
      joints.has(channel.target.node)), name + ": unwanted root translation or foreign bone");
  }
  const gltf = await withoutTextures(raw);
  const scene = gltf.scene;
  requireCondition(scene instanceof Group, name + ": expected GLTF scene root");
  const skeletons = [];
  scene.traverse(child => { if (child instanceof SkinnedMesh) skeletons.push(child.skeleton); });
  requireCondition(skeletons.length > 0, name + ": character is not skinned");
  const bones = new Map();
  for (const bone of skeletons[0].bones) bones.set(canonicalBone(bone.name), bone);
  for (const semantic of ["pelvis", "head", "upperarm_l", "lowerarm_l",
    "hand_l", "upperarm_r", "lowerarm_r", "hand_r", "thigh_l", "calf_l",
    "foot_l", "thigh_r", "calf_r", "foot_r"])
    requireCondition(bones.has(semantic), name + ": missing anatomy " + semantic);
  const bodyBox = new Box3().setFromObject(scene, true);
  const bodyHeight = bodyBox.getSize(new Vector3()).y;
  requireCondition(bodyHeight > 0.2 && Number.isFinite(bodyHeight), name + ": unusable rest geometry");
  const mixer = new AnimationMixer(scene);
  const checks = [];
  for (const motion of MOTIONS) {
    const clip = gltf.animations.find(a => a.name === motion);
    requireCondition(clip && clip.tracks.length >= 20 && clip.duration > 0,
      name + ": GLTFLoader could not play " + motion);
    const action = mixer.clipAction(clip).reset().play();
    for (const factor of [0.05, 0.35, 0.7, 0.95]) {
      mixer.setTime(clip.duration * factor);
      scene.updateMatrixWorld(true);
      const box = new Box3().setFromObject(scene, true);
      const size = box.getSize(new Vector3());
      requireCondition(size.toArray().every(Number.isFinite) &&
        size.y >= bodyHeight * 0.4 && size.y <= bodyHeight * 2.8 &&
        size.x <= bodyHeight * 3.5 && size.z <= bodyHeight * 3.5,
      name + ": implausible 3D skinned bounds during " + motion + " at " + factor +
        ": " + JSON.stringify(size.toArray()));
      const world = key => bones.get(key).getWorldPosition(new Vector3());
      const pelvis = world("pelvis"), head = world("head");
      requireCondition(head.distanceTo(pelvis) <= bodyHeight * 1.8,
        name + ": head escaped skeleton in " + motion);
      for (const hand of ["hand_l", "hand_r"]) {
        requireCondition(world(hand).distanceTo(pelvis) <= bodyHeight * 1.8,
          name + ": displaced " + hand + " during " + motion);
      }
      checks.push({ clip: motion, time: Math.round(factor * 100) / 100,
        width: +size.x.toFixed(3), height: +size.y.toFixed(3) });
    }
    action.stop();
  }
  mixer.stopAllAction();
  console.log(name + ": " + doc.animations.length + " clips, " + joints.size +
    " real bones, " + checks.length + " 3D poses within bounds");
}

async function main() {
  const folder = process.argv[2];
  if (!folder) throw Error("Usage: node scripts/check-quaternius-models.mjs model-dir");
  for (const name of EXPECTED) await checkCharacter(join(folder, name + ".glb"), name);
}
if (process.argv[1]?.endsWith("check-quaternius-models.mjs"))
  await main().catch(error => { console.error(error); process.exitCode = 1; });
