#!/usr/bin/env node
/**
 * Research-only verification of actual converted Mixamo GLB animation layers.
 * No video, FBX, GLB, or model is written inside the public repository.
 * Structural and mixer checks do NOT replace visual approval on a fighter rig.
 *
 * node scripts/verify-mixamo-layers.ts --directory /tmp/fighters-research-glb \
 *   --attack Lead_Jab_2 --locomotion Fighting_Idle \
 *   --locomotion Medium_Step_Forward --locomotion Step_Backward_3 --locomotion Jump
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationClip, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { maskClip, trackBoneName } from "../src/render/animation-layers.ts";

const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
type Source = { filename: string; motionId: string; sha256: string | null; researchGlb?: { sha256: string } };
const catalog = JSON.parse(readFileSync(resolve(REPO, "assets/mixamo-available-clips.json"), "utf8")) as { clips: Source[] };
const indexed = new Map(catalog.clips.map(clip => [clip.filename.replace(/\.fbx$/, ""), clip]));

interface Loaded {
  readonly name: string;
  readonly scene: Object3D;
  readonly clip: AnimationClip;
  readonly sha256: string;
  readonly bones: readonly string[];
}

function privatePath(path: string): string {
  const absolute = resolve(path);
  const rel = relative(REPO, absolute);
  if (absolute === REPO || (!rel.startsWith(".." + sep) && rel !== "..")) {
    throw new Error("Keep standalone GLBs and reports outside the public Fighters repository");
  }
  return absolute;
}

async function loadClip(name: string, directory: string): Promise<Loaded> {
  const source = indexed.get(name);
  if (!source) throw new Error(`Unknown catalog clip: ${name}`);
  const bytes = readFileSync(resolve(directory, `${name}.glb`));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (source.researchGlb?.sha256 && source.researchGlb.sha256 !== sha256) {
    throw new Error(`Research GLB checksum mismatch: ${name}`);
  }
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer, "");
  if (gltf.animations.length !== 1) throw new Error(`Expected one animation in ${name}`);
  const bones: string[] = [];
  gltf.scene.traverse(object => { if ("isBone" in object && object.isBone) bones.push(object.name); });
  if (!bones.length) throw new Error(`No rig in ${name}`);
  return { name, scene: gltf.scene, clip: gltf.animations[0], sha256, bones: bones.sort() };
}

function rootMotion(clip: AnimationClip) {
  const track = clip.tracks.find(track => track.name.endsWith(".position") && trackBoneName(track.name) === "hips");
  if (!track || track.values.length < 6) return null;
  const first = Array.from(track.values.slice(0, 3));
  const last = Array.from(track.values.slice(-3));
  const deltaMeters = last.map((value, i) => +(value - first[i]).toFixed(4));
  const maxAxisExcursionMeters = [0, 0, 0];
  for (let i = 0; i < track.values.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      maxAxisExcursionMeters[axis] = Math.max(maxAxisExcursionMeters[axis], Math.abs(track.values[i + axis] - first[axis]));
    }
  }
  const timeSeconds = +clip.duration.toFixed(4);
  return {
    deltaMeters,
    maxAxisExcursionMeters: maxAxisExcursionMeters.map(value => +value.toFixed(4)),
    timeSeconds,
    velocityMetersPerSecond: deltaMeters.map(delta => +(delta / timeSeconds).toFixed(4)),
  };
}

function probePair(base: Loaded, attack: Loaded) {
  if (JSON.stringify(base.bones) !== JSON.stringify(attack.bones)) {
    throw new Error(`${base.name} / ${attack.name}: different bone skeletons`);
  }
  const lower = maskClip(base.clip, "lowerBody");
  const upper = maskClip(attack.clip, "upperBody");
  const lowerNames = new Set(lower.tracks.map(track => track.name));
  const overlapping = upper.tracks.filter(track => lowerNames.has(track.name));
  if (overlapping.length) throw new Error(`${base.name}: conflicting tracks: ${overlapping.map(track => track.name)}`);
  const tracks = [...lower.tracks, ...upper.tracks];
  const missingTargets = tracks.filter(track => !base.scene.getObjectByName(track.name.split(".")[0]));
  if (missingTargets.length) throw new Error(`${base.name}: mixer targets missing from rig: ${missingTargets.map(track => track.name)}`);
  const root = base.scene.getObjectByName("mixamorigHips");
  if (!root) throw new Error(`${base.name}: YBot Hips root missing; adapt test to the rig before approval`);
  const initialRoot = root.position.clone();
  const rest = new Map<string, Object3D["quaternion"]>();
  for (const track of tracks.filter(track => track.name.endsWith(".quaternion"))) {
    const name = track.name.split(".")[0];
    const object = base.scene.getObjectByName(name)!;
    rest.set(name, object.quaternion.clone());
  }
  const mixer = new AnimationMixer(base.scene);
  mixer.clipAction(lower).setLoop(LoopRepeat, Infinity).play();
  const strike = mixer.clipAction(upper);
  strike.setLoop(LoopOnce, 1);
  strike.clampWhenFinished = true;
  strike.play();
  let upperRadianChange = 0;
  let lowerRadianChange = 0;
  for (let frame = 0; frame <= 30; frame++) {
    mixer.setTime(attack.clip.duration * frame / 30);
    if (root.position.distanceTo(initialRoot) > 1e-5) throw new Error(`${base.name}: unintended animated root translation`);
    for (const [layer, clip] of [["upper", upper], ["lower", lower]] as const) {
      for (const track of clip.tracks.filter(track => track.name.endsWith(".quaternion"))) {
        const name = track.name.split(".")[0];
        const current = base.scene.getObjectByName(name)!.quaternion;
        const angle = rest.get(name)!.angleTo(current);
        if (!Number.isFinite(angle)) throw new Error(`${base.name}: invalid bone rotation in ${layer}`);
        if (layer === "upper") upperRadianChange = Math.max(upperRadianChange, angle);
        else lowerRadianChange = Math.max(lowerRadianChange, angle);
      }
    }
  }
  if (upperRadianChange < 0.05) throw new Error(`${base.name}: punch overlay did not move upper bones`);
  if (lowerRadianChange < 0.005) throw new Error(`${base.name}: locomotion did not move lower bones`);
  mixer.stopAllAction();
  mixer.uncacheRoot(base.scene);
  return {
    locomotion: base.name,
    attack: attack.name,
    sharedBoneCount: base.bones.length,
    lowerTracks: lower.tracks.length,
    upperTracks: upper.tracks.length,
    competingTracks: overlapping.length,
    missingBindings: missingTargets.length,
    maxLowerBoneChangeRadians: +lowerRadianChange.toFixed(4),
    maxUpperBoneChangeRadians: +upperRadianChange.toFixed(4),
    baseSourceRootMotion: rootMotion(base.clip),
    rootTranslationFromLayeredMixerMeters: 0,
    structurallyBlendable: true,
    visuallyApproved: false,
  };
}

async function main() {
  let directory = "";
  let attack = "";
  let reportPath = "";
  const bases: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!value) throw new Error(`Missing argument for ${flag}`);
    if (flag === "--directory") directory = value;
    else if (flag === "--attack") attack = value.replace(/\.glb$/, "");
    else if (flag === "--locomotion") bases.push(value.replace(/\.glb$/, ""));
    else if (flag === "--report") reportPath = value;
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!directory || !attack || !bases.length) throw new Error("Usage: --directory PRIVATE_DIR --attack CLIP --locomotion CLIP [--locomotion CLIP ...] [--report PRIVATE_FILE]");
  const privateDirectory = privatePath(directory);
  const loaded = new Map<string, Loaded>();
  for (const name of new Set([...bases, attack])) loaded.set(name, await loadClip(name, privateDirectory));
  const combos = bases.map(name => probePair(loaded.get(name)!, loaded.get(attack)!));
  const report = {
    schemaVersion: 1,
    sourceRig: "Mixamo YBot",
    evidence: "Actual privately converted and checksum-verified GLB animations in a Three.js mixer",
    glbIdentity: [...loaded.values()].map(clip => ({ name: clip.name, motionId: indexed.get(clip.name)!.motionId, glbSha256: clip.sha256 })),
    combos,
    approvedForProduction: false,
    remainingChecks: ["Human review of the rendered composite", "Retarget to each final fighter", "Match source gait speed/phase to simulation", "Contact frames and foot IK", "Source license for distribution"],
  };
  if (reportPath) writeFileSync(privatePath(reportPath), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
