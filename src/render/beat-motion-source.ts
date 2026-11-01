import { GAME_MOTION_NAMES } from "./beat-character-animator.ts";

export const FIGHTERS_MOTION_PROVENANCE = "fighters-quaternius-accad-own-skin-v2";
export type MotionSourceDescription = Readonly<{
  name?: string;
  extras?: { rigTransfer?: string; license?: string; source?: string };
}>;

/** Fail closed: 86 Quaternius CC0 + exactly two licensed ACCAD kicks, native skin. */
export function validateMotionSource(animations: readonly MotionSourceDescription[]): void {
  const cc0 = animations.filter(a => /^UAL[12]_/.test(a.name ?? ""));
  const kicks = animations.filter(a => /^ACCAD_/.test(a.name ?? ""));
  if (animations.length !== 88 || new Set(animations.map(a => a.name)).size !== 88 ||
      cc0.length !== 86 || kicks.length !== 2 ||
      kicks.some(a => !["ACCAD_Front_Kick", "ACCAD_Roundhouse_Kick"].includes(a.name ?? "")) ||
      Object.values(GAME_MOTION_NAMES).some(name => !animations.some(a => a.name === name)) ||
      animations.some(a => a.extras?.rigTransfer !== FIGHTERS_MOTION_PROVENANCE ||
        a.extras?.license !== (a.name?.startsWith("ACCAD_") ? "CC-BY-3.0" : "CC0-1.0"))) {
    throw new Error("Expected 86 Quaternius CC0 and two ACCAD CC BY motions on each real skin");
  }
}
