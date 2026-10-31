import { GAME_MOTION_NAMES } from "./beat-character-animator.ts";

export type MotionSourceKind = "legacy-ybot-rebind" | "native-same-rig";
export type MotionSourceDescription = Readonly<{
  name?: string;
  extras?: { retargeting?: string };
}>;

/**
 * Reject mixed/synthetic/partial clip packs before attaching any real rig.
 * Each of the seven clips must come from a SINGLE verified pipeline.
 */
export function validateMotionSource(animations: readonly MotionSourceDescription[]): MotionSourceKind {
  const relevant = animations.filter(a => a.name?.startsWith("Fighters_Mixamo_"));
  const expected = new Set(Object.values(GAME_MOTION_NAMES));
  const names = new Set(relevant.map(a => a.name));
  if (relevant.length !== expected.size || names.size !== expected.size ||
      [...expected].some(name => !names.has(name))) {
    throw new Error("Character is missing one or more of the seven exact Mixamo gameplay motions");
  }
  const markers = new Set(relevant.map(a => a.extras?.retargeting));
  if (markers.size !== 1) {
    throw new Error("Character combines animations from incompatible rig sources");
  }
  const marker = [...markers][0];
  if (marker === "same-rig-mixamo-fbx-v1") return "native-same-rig";
  if (marker === "warconquer-inverse-bind-world-v1") return "legacy-ybot-rebind";
  throw new Error("Character has an unverified or untagged animation source");
}
