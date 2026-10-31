import { GAME_MOTION_NAMES } from "./beat-character-animator.ts";

export const CC0_ANIMATION_PROVENANCE = "quaternius-cc0-own-skin-v1";
export type MotionSourceDescription = Readonly<{
  name?: string;
  extras?: { rigTransfer?: string; license?: string; source?: string };
}>;

/** Fail closed: no Adobe/YBot fallback, partial pack or mixed source rigs. */
export function validateMotionSource(animations: readonly MotionSourceDescription[]): void {
  if (animations.length !== 86 || new Set(animations.map(a => a.name)).size !== 86 ||
      Object.values(GAME_MOTION_NAMES).some(name => !animations.some(a => a.name === name)) ||
      animations.some(a => !/^UAL[12]_/.test(a.name ?? "") ||
        a.extras?.rigTransfer !== CC0_ANIMATION_PROVENANCE ||
        a.extras?.license !== "CC0-1.0")) {
    throw new Error("Expected all 86 same-skin Quaternius CC0 animations");
  }
}
