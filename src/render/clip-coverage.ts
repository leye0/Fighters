import type { FighterDefinition } from "../engine/simulation.ts";

export const REQUIRED_FIGHTER_STATES = [
  "idle", "walk", "jump", "crouch", "hitstun", "blockstun", "ko",
] as const;

/**
 * Production render validation: no combat action silently shows an idle pose
 * or a guessed substitute clip. Resolve per-fighter names, then check the
 * actual GLB's AnimationClip.name set.
 */
export function missingAnimationClipNames(
  fighter: FighterDefinition,
  available: ReadonlySet<string>,
  animationMap?: Readonly<Record<string, string>>,
): readonly string[] {
  const required = [
    ...REQUIRED_FIGHTER_STATES.map(key => animationMap?.[key] ?? key),
    ...fighter.moves.map(move => animationMap?.[move.id] ??
      (move.animationRole ? animationMap?.[move.animationRole] : undefined) ??
      move.animationRole ?? move.id),
  ];
  return [...new Set(required.filter(clipName => !available.has(clipName)))];
}
