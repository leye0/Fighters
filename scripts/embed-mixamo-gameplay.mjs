#!/usr/bin/env node
/** Bake real Mixamo locomotion/turn clips into *game character* GLBs, never publish the raw
 * FBX, the standalone YBot animation GLB or a reusable animation pack.
 * Inputs: <private-YBot-GLB-directory> <source-character.glb> <output-character.glb> [...]
 * Each output includes the original licensed skinned character plus named,
 * retargeted quaternion animation tracks for that character's *own* bones.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { retargetBindPoseClip } from "./retarget-mixamo-bind.mjs";

export const GAME_MOTIONS = Object.freeze([
  { source: "Fighting_Idle.glb", name: "Fighters_Mixamo_Fighting_Idle" },
  { source: "Walking_21.glb", name: "Fighters_Mixamo_Walk_Standard" },
  { source: "Walking_6.glb", name: "Fighters_Mixamo_Walk_Feminine" },
  { source: "Walking_Backwards.glb", name: "Fighters_Mixamo_Walk_Backward" },
  { source: "Left_Turn_3.glb", name: "Fighters_Mixamo_Left_Turn_180" },
  { source: "Jump.glb", name: "Fighters_Mixamo_Jump" },
  { source: "Falling_Idle.glb", name: "Fighters_Mixamo_Fall" },
]);
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function readGLB(raw) {
  if (raw.length < 28 || raw.toString("utf8", 0, 4) !== "glTF" ||
      raw.readUInt32LE(4) !== 2 || raw.readUInt32LE(8) !== raw.length ||
      raw.readUInt32LE(16) !== JSON_CHUNK) throw Error("Invalid binary glTF");
  const jsonLength = raw.readUInt32LE(12);
  const binHead = 20 + jsonLength;
  if (binHead + 8 > raw.length || raw.readUInt32LE(binHead + 4) !== BIN_CHUNK) {
    throw Error("Expected a binary buffer chunk");
  }
  const binLength = raw.readUInt32LE(binHead);
  if (binHead + 8 + binLength !== raw.length) throw Error("Invalid glTF binary length");
  return {
    json: JSON.parse(raw.subarray(20, binHead).toString("utf8")),
    bin: raw.subarray(binHead + 8),
  };
}

function encodeGLB(json, bin) {
  const source = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20);
  source.copy(paddedJson);
  const paddedBin = Buffer.alloc(Math.ceil(bin.length / 4) * 4);
  bin.copy(paddedBin);
  const result = Buffer.alloc(28 + paddedJson.length + paddedBin.length);
  result.write("glTF", 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(paddedJson.length, 12);
  result.writeUInt32LE(JSON_CHUNK, 16);
  paddedJson.copy(result, 20);
  const binHead = 20 + paddedJson.length;
  result.writeUInt32LE(paddedBin.length, binHead);
  result.writeUInt32LE(BIN_CHUNK, binHead + 4);
  paddedBin.copy(result, binHead + 8);
  return result;
}

export async function loadRigWithoutImages(raw) {
  // Remove materials and image references in memory only: GLTFLoader in Node
  // cannot decode WebP. Original GLB bytes remain untouched for the output.
  const { json, bin } = readGLB(raw);
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) delete primitive.material;
  }
  for (const prop of ["materials", "textures", "images", "samplers"]) delete json[prop];
  json.extensionsUsed = (json.extensionsUsed ?? []).filter(x => !x.includes("texture"));
  json.extensionsRequired = (json.extensionsRequired ?? []).filter(x => !x.includes("texture"));
  const data = encodeGLB(json, bin);
  return new GLTFLoader().parseAsync(data.buffer.slice(
    data.byteOffset, data.byteOffset + data.byteLength), "");
}

/** All animation curves are own-rig joint rotations, not unretargeted YBot tracks. */
export function embedClip(sourceBinary, clip, name) {
  const { json, bin } = readGLB(sourceBinary);
  if (!GAME_MOTIONS.some(motion => motion.name === name) ||
      (json.animations ?? []).some(animation => animation.name === name)) {
    throw Error("Unknown or already embedded Mixamo gameplay motion: " + name);
  }
  if (json.buffers?.length !== 1 || !json.nodes?.length) {
    throw Error("Only one-buffer character GLBs are supported");
  }
  const nodeIndices = new Map(json.nodes.map((node, index) => [
    (node.name ?? "").replace(/[^A-Za-z0-9_\-]/g, ""), index,
  ]));
  const appended = [];
  let length = bin.length;
  json.bufferViews ??= [];
  json.accessors ??= [];
  const addAccessor = (values, size, type) => {
    if (!values.length || values.length % size !== 0 ||
        !Array.from(values).every(Number.isFinite)) throw Error("Invalid animation values");
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
    const view = json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length }) - 1;
    length += bytes.length;
    appended.push(bytes);
    const min = type === "SCALAR" ? [Math.min(...values)] : undefined;
    const max = type === "SCALAR" ? [Math.max(...values)] : undefined;
    return json.accessors.push({ bufferView: view, byteOffset: 0, componentType: 5126,
      count: values.length / size, type, ...(min ? { min, max } : {}) }) - 1;
  };

  const animation = { name, samplers: [], channels: [] };
  for (const track of clip.tracks) {
    const match = /^\.bones\[([^\]]+)\]\.quaternion$/.exec(track.name);
    if (!match) throw Error(`Unexpected non-quaternion animation track: ${track.name}`);
    const nodeIndex = nodeIndices.get(match[1]);
    if (nodeIndex === undefined) throw Error(`Target rig node not found: ${match[1]}`);
    const input = addAccessor(track.times, 1, "SCALAR");
    const output = addAccessor(track.values, 4, "VEC4");
    const sampler = animation.samplers.push({ input, output, interpolation: "LINEAR" }) - 1;
    animation.channels.push({ sampler, target: { node: nodeIndex, path: "rotation" } });
  }
  if (animation.channels.length < 15) throw Error("Incomplete retargeted turn animation");
  json.animations ??= [];
  json.animations.push(animation);
  json.buffers[0].byteLength = length;
  return { buffer: encodeGLB(json, Buffer.concat([bin, ...appended])),
    tracks: animation.channels.length };
}

async function main() {
  const [privateDir, ...pairs] = process.argv.slice(2);
  if (!privateDir || pairs.length < 2 || pairs.length % 2 !== 0) {
    throw Error("Usage: embed-mixamo-gameplay.mjs <private-glb-directory> <input.glb> <output.glb> [...]");
  }
  const motions = await Promise.all(GAME_MOTIONS.map(async spec => ({
    ...spec, binary: await readFile(join(privateDir, spec.source)),
  })));
  const audits = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const [sourcePath, outputPath] = pairs.slice(i, i + 2);
    if (resolve(sourcePath) === resolve(outputPath)) throw Error("Source and output must differ");
    const original = await readFile(sourcePath);
    const existing = new Set((readGLB(original).json.animations ?? []).map(clip => clip.name));
    const integrated = GAME_MOTIONS.filter(motion => existing.has(motion.name));
    if (integrated.length) throw Error("Refusing to build on baked animations; supply a clean GLB from the pinned pre-Mixamo commit");
    let output = original;
    const baked = [];
    for (const motion of motions) {
      const converted = retargetBindPoseClip(original, motion.binary, motion.name);
      const result = embedClip(output, converted.clip, motion.name);
      output = result.buffer;
      baked.push({ name: motion.name, ...converted.audit, tracks: result.tracks });
    }
    await writeFile(outputPath, output);
    audits.push({ source: sourcePath, output: outputPath,
      clips: baked, inputBytes: original.length, outputBytes: output.length });
  }
  console.log(JSON.stringify({ integratedGameMotions: GAME_MOTIONS.length, audits }, null, 2));
}

if (process.argv[1]?.endsWith("embed-mixamo-gameplay.mjs")) {
  await main();
}
