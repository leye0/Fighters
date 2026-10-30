import { AnimationClip, AnimationMixer, Object3D, SkinnedMesh } from "three";
import { retargetClip } from "three/addons/utils/SkeletonUtils.js";

/** Claudia/Carla use a different naming convention from the Mixamo-style
 * skeleton contained in the licensed Realistic Man GLB. Match semantic bones
 * rather than hard-coding their generated numeric suffixes.
 */
const boneEquivalents: Readonly<Record<string, string>> = {
  hip: "Hips", spine_01: "Spine", spine_02: "Spine1", spine_03: "Spine2",
  neck: "Neck", head: "Head",
  shoulder_l: "LeftShoulder", upperarm_l: "LeftArm",
  lowerarm_l: "LeftForeArm", hand_l: "LeftHand",
  shoulder_r: "RightShoulder", upperarm_r: "RightArm",
  lowerarm_r: "RightForeArm", hand_r: "RightHand",
  upperleg_l: "LeftUpLeg", lowerleg_l: "LeftLeg",
  foot_l: "LeftFoot", ball_l: "LeftToeBase",
  upperleg_r: "RightUpLeg", lowerleg_r: "RightLeg",
  foot_r: "RightFoot", ball_r: "RightToeBase",
};

export function mixamoBoneForRigBone(
  targetName: string, sourceBoneNames: ReadonlySet<string>,
): string | undefined {
  // Both glTF exporters suffix names with numbers that vary per asset.
  const semantic = targetName.replace(/_\d+$/, "");
  const suffix = boneEquivalents[semantic];
  if (!suffix) return undefined;
  // Three.js GLTFLoader sanitizes ':' in node names (mixamorig:Hips ->
  // mixamorigHips); other loaders may preserve the original spelling.
  const matches = [...sourceBoneNames].filter(name =>
    new RegExp(`^mixamorig:?${suffix}(_\\d+)?$`).test(name));
  return matches.length === 1 ? matches[0] : undefined;
}

function firstSkinned(scene: Object3D): SkinnedMesh {
  let found: SkinnedMesh | undefined;
  scene.traverse(node => {
    if (!found && node instanceof SkinnedMesh && node.skeleton.bones.length) found = node;
  });
  if (!found) throw new Error("Animation requires a real skinned rig");
  return found;
}

/** Samples an actual animation that shipped inside the CC BY male source and
 * transfers its joint rotations onto the acquired female skeleton. Never
 * misidentify it as a reviewed Mixamo locomotion/attack/turn clip.
 */
export function retargetEmbeddedMotion(
  targetScene: Object3D, sourceScene: Object3D, clip: AnimationClip,
): { mixer: AnimationMixer; clip: AnimationClip; mappedJoints: number } {
  if (!clip.tracks.length || clip.duration <= 0) {
    throw new Error("Source character animation has no playable keyframes");
  }
  const target = firstSkinned(targetScene);
  const source = firstSkinned(sourceScene);
  const sourceNames = new Set(source.skeleton.bones.map(bone => bone.name));
  const mappedJoints = target.skeleton.bones.filter(bone =>
    mixamoBoneForRigBone(bone.name, sourceNames)).length;
  if (mappedJoints < 15) throw new Error("Character skeleton retargeting is too incomplete");
  const converted = retargetClip(target, source, clip, {
    fps: 30,
    hip: "__no_root_translation__",
    getBoneName: (bone: { name: string }) => mixamoBoneForRigBone(bone.name, sourceNames) ?? "",
  });
  if (!converted.tracks.length) throw new Error("Retarget produced no animated bones");
  const mixer = new AnimationMixer(target);
  mixer.clipAction(converted).play();
  return { mixer, clip: converted, mappedJoints };
}

/** A real embedded source clip plays on each *cloned* male skeleton. */
export function playEmbeddedMotion(
  actorScene: Object3D, clip: AnimationClip,
): AnimationMixer {
  if (!clip.tracks.length || clip.duration <= 0) throw new Error("Empty embedded animation");
  const mixer = new AnimationMixer(actorScene);
  mixer.clipAction(clip).play();
  return mixer;
}
