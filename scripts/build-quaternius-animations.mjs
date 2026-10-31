#!/usr/bin/env node
/**
 * Rebuild the three original Fighters meshes with all CC0 Quaternius Standard
 * animations baked on their OWN skins. No Adobe service, GUI, bone offsets,
 * Mixamo/YBot clips or character-specific skeleton corrections are involved.
 *
 * Usage:
 *   node scripts/build-quaternius-animations.mjs UAL1_Standard.glb UAL2_Standard.glb \
 *     public/models work/quaternius-models
 *
 * Sources: https://quaternius.itch.io/universal-animation-library
 *          https://quaternius.itch.io/universal-animation-library-2
 * Licence: CC0 1.0, Standard editions. The input meshes retain their own
 * Renderpeople/J.azali Sketchfab CC BY credits and geometry/skin.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Matrix4, Quaternion, Vector3 } from "three";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const MARKER = "quaternius-cc0-own-skin-v1";
const ROSTER = ["claudia", "carla", "realistic-man"];
const PACKS = ["UAL1", "UAL2"];
const NUMBER_OF_MOTIONS = 86;
const REQUIRED_BONES = ["pelvis", "spine_01", "Head", "upperarm_l", "lowerarm_l",
  "hand_l", "upperarm_r", "lowerarm_r", "hand_r", "thigh_l", "calf_l",
  "foot_l", "thigh_r", "calf_r", "foot_r"];
const CORE_ANIMATIONS = ["UAL1_Idle_Loop", "UAL1_Walk_Loop", "UAL1_Jump_Start",
  "UAL1_Jump_Loop", "UAL1_Jump_Land", "UAL1_Punch_Jab", "UAL1_Punch_Cross",
  "UAL2_Melee_Hook", "UAL2_Zombie_Walk_Fwd_Loop"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const q = () => new Quaternion();

export function parseGLB(bytes) {
  if (bytes.length < 28 || bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length ||
      bytes.readUInt32LE(16) !== JSON_CHUNK) throw Error("Invalid glTF 2 binary");
  const jsonLength = bytes.readUInt32LE(12);
  const binOffset = 20 + jsonLength;
  if (binOffset + 8 > bytes.length || bytes.readUInt32LE(binOffset + 4) !== BIN_CHUNK)
    throw Error("Missing GLB binary buffer");
  const length = bytes.readUInt32LE(binOffset);
  if (binOffset + 8 + length !== bytes.length) throw Error("GLB buffer length mismatch");
  return { doc: JSON.parse(bytes.subarray(20, binOffset).toString("utf8")),
    bin: bytes.subarray(binOffset + 8) };
}

export function encodeGLB(doc, data) {
  const raw = Buffer.from(JSON.stringify(doc));
  const json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20);
  raw.copy(json);
  const bin = Buffer.alloc(Math.ceil(data.length / 4) * 4);
  data.copy(bin);
  doc.buffers[0].byteLength = bin.length;
  // Buffer length is serialized in the JSON: reencode after setting it.
  const next = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.alloc(Math.ceil(next.length / 4) * 4, 0x20);
  next.copy(padded);
  const result = Buffer.alloc(28 + padded.length + bin.length);
  result.write("glTF", 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  result.writeUInt32LE(JSON_CHUNK, 16);
  padded.copy(result, 20);
  const offset = 20 + padded.length;
  result.writeUInt32LE(bin.length, offset);
  result.writeUInt32LE(BIN_CHUNK, offset + 4);
  bin.copy(result, offset + 8);
  return result;
}

function rows(gltf, index) {
  const a = gltf.doc.accessors[index];
  const count = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[a?.type];
  if (!count || a.componentType !== 5126 || a.sparse || a.bufferView === undefined)
    throw Error("Expected a dense float32 glTF accessor");
  const view = gltf.doc.bufferViews[a.bufferView];
  if (view.buffer !== 0) throw Error("Unsupported source GLB buffer");
  const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = view.byteStride ?? count * 4;
  if (offset + (a.count - 1) * stride + count * 4 > gltf.bin.length)
    throw Error("Invalid glTF accessor boundaries");
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: count },
    (_, k) => gltf.bin.readFloatLE(offset + i * stride + k * 4)));
}

function parentsOf(nodes) {
  const parents = Array(nodes.length).fill(-1);
  nodes.forEach((node, i) => (node.children ?? []).forEach(child => {
    if (parents[child] !== -1) throw Error("Multiple glTF parents");
    parents[child] = i;
  }));
  return parents;
}

function nodeQuaternion(node) {
  if (!node.matrix) return q().fromArray(node.rotation ?? [0, 0, 0, 1]).normalize();
  const rotation = q();
  new Matrix4().fromArray(node.matrix).decompose(new Vector3(), rotation, new Vector3());
  return rotation.normalize();
}

function worldRotations(parents, locals) {
  const result = Array(locals.length);
  const busy = new Set();
  const get = i => {
    if (result[i]) return result[i];
    if (busy.has(i)) throw Error("Cyclic glTF node hierarchy");
    busy.add(i);
    result[i] = parents[i] < 0 ? locals[i].clone() :
      get(parents[i]).clone().multiply(locals[i]).normalize();
    busy.delete(i);
    return result[i];
  };
  for (let i = 0; i < locals.length; i++) get(i);
  return result;
}

function binds(gltf) {
  const rotations = new Map(), positions = new Map();
  for (const skin of gltf.doc.skins ?? []) {
    if (skin.inverseBindMatrices === undefined) throw Error("Skin has no inverse bind matrices");
    const transforms = rows(gltf, skin.inverseBindMatrices);
    if (transforms.length !== skin.joints.length) throw Error("Skin bind mismatch");
    skin.joints.forEach((id, i) => {
      const m = new Matrix4().fromArray(transforms[i]).invert();
      const pos = new Vector3(), rot = q(), scale = new Vector3();
      m.decompose(pos, rot, scale);
      if (!pos.toArray().every(Number.isFinite) || !rot.toArray().every(Number.isFinite))
        throw Error("Non-finite skeleton rest transform");
      const old = rotations.get(id);
      if (old && old.angleTo(rot) > 0.06) throw Error("Conflicting rest rotations");
      rotations.set(id, rot.normalize());
      positions.set(id, pos);
    });
  }
  if (rotations.size < 20) throw Error("Humanoid has an incomplete skinned skeleton");
  return { rotations, positions };
}

/** Canonical anatomy, independent of generated numeric suffixes and exports. */
export function canonicalBone(name) {
  if (/^spine_0[123]$/.test(name.toLowerCase())) return name.toLowerCase();
  let n = name.replace(/^mixamorig:?/i, "").replace(/_\d+$/, "").toLowerCase();
  n = n.replace(/spine_(0[123])_\d+$/, "spine_$1");
  const equivalents = {
    hip: "pelvis", hips: "pelvis", neck: "neck_01", headtop_end: "head_end",
    spine: "spine_01", spine1: "spine_02", spine2: "spine_03",
    leftshoulder: "clavicle_l", rightshoulder: "clavicle_r",
    leftarm: "upperarm_l", rightarm: "upperarm_r",
    leftforearm: "lowerarm_l", rightforearm: "lowerarm_r",
    lefthand: "hand_l", righthand: "hand_r",
    leftupleg: "thigh_l", rightupleg: "thigh_r",
    leftleg: "calf_l", rightleg: "calf_r",
    leftfoot: "foot_l", rightfoot: "foot_r",
    lefttoebase: "ball_l", righttoebase: "ball_r",
    upperleg_l: "thigh_l", upperleg_r: "thigh_r",
    lowerleg_l: "calf_l", lowerleg_r: "calf_r",
    shoulder_l: "clavicle_l", shoulder_r: "clavicle_r",
    ball_l: "ball_l", ball_r: "ball_r",
    neck_01: "neck_01", head: "head",
  };
  if (/^spine_0[123]$/.test(n)) return n;
  return equivalents[n] ?? n;
}

function boneIndex(gltf, bind) {
  const index = new Map();
  for (const i of bind.rotations.keys()) {
    const name = canonicalBone(gltf.doc.nodes[i].name ?? "");
    if (!name || index.has(name)) continue;
    index.set(name, i);
  }
  return index;
}

function anatomyFrame(index, positions) {
  const position = name => {
    const id = index.get(name);
    if (id === undefined || !positions.has(id)) throw Error("Missing anatomy landmark " + name);
    return positions.get(id);
  };
  const up = position("head").clone().sub(position("pelvis")).normalize();
  const right = position("clavicle_r").clone().sub(position("clavicle_l"));
  right.addScaledVector(up, -right.dot(up)).normalize();
  const forward = right.clone().cross(up).normalize();
  if (up.lengthSq() < 0.9 || right.lengthSq() < 0.9 || forward.lengthSq() < 0.9)
    throw Error("Cannot derive a reliable anatomical orientation");
  return q().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward)).normalize();
}

function sourceAnimation(gltf, animation) {
  const tracks = new Map();
  let duration = 0;
  for (const channel of animation.channels) {
    if (channel.target.path !== "rotation") continue;
    const sampler = animation.samplers[channel.sampler];
    if (!sampler || (sampler.interpolation ?? "LINEAR") !== "LINEAR")
      throw Error("Only linear Quaternius source motions are supported");
    const times = rows(gltf, sampler.input).map(v => v[0]);
    const frames = rows(gltf, sampler.output).map(v => q().fromArray(v).normalize());
    if (!times.length || times.length !== frames.length ||
        times.some((t, i) => !Number.isFinite(t) || (i > 0 && t < times[i - 1])))
      throw Error("Invalid Quaternius animation timeline");
    duration = Math.max(duration, times.at(-1));
    tracks.set(channel.target.node, { times, frames });
  }
  if (duration <= 0 || duration > 30 || tracks.size < 50)
    throw Error("Quaternius clip has inadequate source skeleton tracks: " + animation.name);
  return { tracks, duration };
}

function sample(track, time) {
  const { times, frames } = track;
  if (time <= times[0]) return frames[0];
  if (time >= times.at(-1)) return frames.at(-1);
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) {
    const middle = (lo + hi) >> 1;
    if (times[middle] <= time) lo = middle; else hi = middle;
  }
  const dt = times[hi] - times[lo];
  return dt <= 0 ? frames[hi] : frames[lo].clone().slerp(frames[hi], (time - times[lo]) / dt);
}

function mappedBones(source, target) {
  const si = boneIndex(source.gltf, source.bind), ti = boneIndex(target.gltf, target.bind);
  const missing = REQUIRED_BONES.filter(name => !si.has(canonicalBone(name)) || !ti.has(canonicalBone(name)));
  if (missing.length) throw Error("Required anatomical bones missing: " + missing.join(", "));
  const pairs = new Map();
  for (const [name, id] of ti) if (si.has(name)) pairs.set(id, si.get(name));
  if (pairs.size < 20) throw Error("Too few compatible humanoid joints: " + pairs.size);
  const sourceFrame = anatomyFrame(si, source.bind.positions);
  const targetFrame = anatomyFrame(ti, target.bind.positions);
  const alignment = targetFrame.multiply(sourceFrame.invert()).normalize();
  return { pairs, alignment, landmarkCoverage: REQUIRED_BONES.length };
}

/** Discard ALL previous animation data (including bytes), not just names. */
export function compactWithoutAnimations(gltf) {
  const doc = structuredClone(gltf.doc);
  if (doc.buffers?.length !== 1) throw Error("Expected single-buffer source character");
  delete doc.animations;
  const accessors = new Set();
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    Object.values(primitive.attributes ?? {}).forEach(i => accessors.add(i));
    if (primitive.indices !== undefined) accessors.add(primitive.indices);
    for (const target of primitive.targets ?? []) Object.values(target).forEach(i => accessors.add(i));
    if (primitive.extensions?.KHR_draco_mesh_compression)
      throw Error("Compressed geometry unsupported by this lossless compact step");
  }
  for (const skin of doc.skins ?? []) if (skin.inverseBindMatrices !== undefined)
    accessors.add(skin.inverseBindMatrices);
  const accessorMap = new Map(), usedViews = new Set();
  const oldAccessors = doc.accessors;
  doc.accessors = oldAccessors.filter((a, i) => {
    if (!accessors.has(i)) return false;
    accessorMap.set(i, accessorMap.size);
    if (a.bufferView !== undefined) usedViews.add(a.bufferView);
    if (a.sparse) throw Error("Sparse geometry accessor unsupported");
    return true;
  });
  const mapAccessor = value => {
    if (!accessorMap.has(value)) throw Error("Unmapped geometry accessor");
    return accessorMap.get(value);
  };
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    Object.entries(primitive.attributes ?? {}).forEach(([key, id]) =>
      { primitive.attributes[key] = mapAccessor(id); });
    if (primitive.indices !== undefined) primitive.indices = mapAccessor(primitive.indices);
    for (const target of primitive.targets ?? []) Object.entries(target).forEach(([key, id]) =>
      { target[key] = mapAccessor(id); });
  }
  for (const skin of doc.skins ?? []) if (skin.inverseBindMatrices !== undefined)
    skin.inverseBindMatrices = mapAccessor(skin.inverseBindMatrices);
  for (const image of doc.images ?? []) if (image.bufferView !== undefined)
    usedViews.add(image.bufferView);
  const viewMap = new Map(), chunks = [];
  let length = 0;
  doc.bufferViews = doc.bufferViews.filter((view, i) => {
    if (!usedViews.has(i)) return false;
    if (view.buffer !== 0) throw Error("Unsupported external buffer view");
    viewMap.set(i, viewMap.size);
    const payload = gltf.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    if (payload.length !== view.byteLength) throw Error("Truncated geometry/image buffer view");
    const pad = (4 - length % 4) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    view.byteOffset = length;
    chunks.push(payload);
    length += payload.length;
    return true;
  });
  doc.accessors.forEach(a => { if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView); });
  (doc.images ?? []).forEach(image => {
    if (image.bufferView !== undefined) image.bufferView = viewMap.get(image.bufferView);
  });
  if (doc.asset?.extras) {
    for (const key of Object.keys(doc.asset.extras))
      if (/mixamo|retarget|ybot/i.test(key)) delete doc.asset.extras[key];
  }
  doc.buffers[0].byteLength = length;
  return { doc, parts: chunks, length };
}

function addFloatAccessor(output, values, count, type) {
  const binary = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) throw Error("Nonfinite baked quaternion/timestamp");
    binary.writeFloatLE(values[i], i * 4);
  }
  const pad = (4 - output.length % 4) % 4;
  if (pad) { output.parts.push(Buffer.alloc(pad)); output.length += pad; }
  const view = output.doc.bufferViews.push({ buffer: 0, byteOffset: output.length,
    byteLength: binary.length }) - 1;
  output.parts.push(binary);
  output.length += binary.length;
  const minmax = type === "SCALAR" ? { min: [values[0]], max: [values.at(-1)] } : {};
  return output.doc.accessors.push({ bufferView: view, componentType: 5126,
    count, type, ...minmax }) - 1;
}

function bakeMotion(source, target, mapping, animation, packName, output) {
  const sampled = sourceAnimation(source.gltf, animation);
  const sourceParents = parentsOf(source.gltf.doc.nodes);
  const targetParents = parentsOf(target.gltf.doc.nodes);
  const sourceRest = source.gltf.doc.nodes.map(nodeQuaternion);
  const targetRest = target.gltf.doc.nodes.map(nodeQuaternion);
  const count = Math.max(2, Math.round(sampled.duration * 30) + 1);
  const timeline = Array.from({ length: count }, (_, i) => sampled.duration * i / (count - 1));
  const values = new Map([...mapping.pairs.keys()].map(id => [id, []]));
  const inverseAlignment = mapping.alignment.clone().invert();
  for (const time of timeline) {
    const sourceLocals = sourceRest.map((original, i) =>
      sampled.tracks.has(i) ? sample(sampled.tracks.get(i), time) : original);
    const sourceWorld = worldRotations(sourceParents, sourceLocals);
    const actual = [];
    const computing = new Set();
    const get = id => {
      if (actual[id]) return actual[id];
      if (computing.has(id)) throw Error("Cyclic target skeleton");
      computing.add(id);
      const parent = targetParents[id] < 0 ? q() : get(targetParents[id]);
      let local = targetRest[id];
      if (mapping.pairs.has(id)) {
        const src = mapping.pairs.get(id);
        const delta = sourceWorld[src].clone().multiply(source.bind.rotations.get(src).clone().invert());
        const aligned = mapping.alignment.clone().multiply(delta).multiply(inverseAlignment);
        const desired = aligned.multiply(target.bind.rotations.get(id));
        local = parent.clone().invert().multiply(desired).normalize();
        values.get(id).push(...local.toArray());
      }
      actual[id] = parent.clone().multiply(local).normalize();
      computing.delete(id);
      return actual[id];
    };
    for (let id = 0; id < targetRest.length; id++) get(id);
  }
  const name = `${packName}_${animation.name}`;
  const motion = { name, samplers: [], channels: [], extras: {
    source: "Quaternius Universal Animation Library Standard", sourceClip: animation.name,
    license: "CC0-1.0", rigTransfer: MARKER, rootMotion: "in-place" } };
  const times = addFloatAccessor(output, timeline, timeline.length, "SCALAR");
  for (const [id, frames] of values) {
    const curve = addFloatAccessor(output, frames, count, "VEC4");
    const sampler = motion.samplers.push({ input: times, output: curve, interpolation: "LINEAR" }) - 1;
    motion.channels.push({ sampler, target: { node: id, path: "rotation" } });
  }
  if (motion.channels.length < 20) throw Error("Animation lost required bones");
  output.doc.animations.push(motion);
  return { name, frames: count, duration: sampled.duration, joints: motion.channels.length };
}

export function buildCharacter(original, sources, label) {
  if (sources.length !== 2 || sources.some(source => source.gltf.doc.animations.length !== 43))
    throw Error("Expected exactly two 43-clip Quaternius Standard packs");
  const target = { gltf: parseGLB(original) };
  target.bind = binds(target.gltf);
  const output = compactWithoutAnimations(target.gltf);
  output.doc.animations = [];
  const audits = [];
  for (let i = 0; i < sources.length; i++) {
    const mapping = mappedBones(sources[i], target);
    for (const animation of sources[i].gltf.doc.animations) {
      audits.push(bakeMotion(sources[i], target, mapping, animation, PACKS[i], output));
    }
  }
  if (audits.length !== NUMBER_OF_MOTIONS ||
      new Set(audits.map(item => item.name)).size !== NUMBER_OF_MOTIONS ||
      CORE_ANIMATIONS.some(name => !audits.some(item => item.name === name)))
    throw Error("Missing or duplicate required Quaternius motions");
  output.doc.asset.extras ??= {};
  output.doc.asset.extras.fightersMotionSource = {
    strategy: MARKER, character: label, clips: audits.length,
    sources: sources.map(source => ({ pack: source.name, sha256: source.sha256,
      license: "CC0-1.0" })),
  };
  output.doc.buffers[0].byteLength = output.length;
  const bytes = encodeGLB(output.doc, Buffer.concat(output.parts));
  // Verify by parsing the physical output and rechecking every channel.
  const checked = parseGLB(bytes);
  if (checked.doc.animations.length !== NUMBER_OF_MOTIONS ||
      checked.doc.animations.some(a => a.extras?.rigTransfer !== MARKER ||
        a.channels.length < 20 || a.channels.some(c => !target.bind.rotations.has(c.target.node))))
    throw Error("Output validation failed");
  if (checked.doc.animations.some(a => /mixamo|ybot/i.test(a.name)))
    throw Error("Legacy animation survived the rebuild");
  return { bytes, audit: { character: label, clips: audits.length,
    smallestSkeleton: Math.min(...audits.map(a => a.joints)),
    outputBytes: bytes.length, sha256: hash(bytes), clipsInfo: audits } };
}

async function main() {
  const [first, second, inputDir, outputDir] = process.argv.slice(2);
  if (!first || !second || !inputDir || !outputDir ||
      resolve(inputDir) === resolve(outputDir))
    throw Error("Usage: node scripts/build-quaternius-animations.mjs UAL1.glb UAL2.glb input-dir output-dir");
  const sources = await Promise.all([first, second].map(async (path, i) => {
    const binary = await readFile(path);
    const gltf = parseGLB(binary);
    const item = { name: PACKS[i], gltf, sha256: hash(binary) };
    item.bind = binds(gltf);
    return item;
  }));
  await mkdir(outputDir, { recursive: true });
  const report = [];
  for (const name of ROSTER) {
    const { bytes, audit } = buildCharacter(await readFile(join(inputDir, name + ".glb")), sources, name);
    await writeFile(join(outputDir, name + ".glb"), bytes);
    report.push(audit);
    console.log(`${name}: ${audit.clips} CC0 clips, ${audit.smallestSkeleton} animated bones min; ${audit.outputBytes} bytes`);
  }
  await writeFile(join(outputDir, "quaternius-audit.json"), JSON.stringify({
    schemaVersion: 1, strategy: MARKER, inputs: [basename(first), basename(second)],
    characters: report }, null, 2) + "\n");
}

if (process.argv[1]?.endsWith("build-quaternius-animations.mjs"))
  await main().catch(error => { console.error(error); process.exitCode = 1; });
