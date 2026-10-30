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
  // Any mobile upper-body strike can retreat as well as advance. Never
  // substitute a forward gait, which visibly moonwalks during a backstep.
  const needsBackstep = fighter.moves.some(move =>
    move.animationLayer === "upperBody" && (move.groundMovementPercent ?? 0) > 0);
  const required = [
    ...[...REQUIRED_FIGHTER_STATES, ...(needsBackstep ? ["walkBack"] : [])]
      .map(key => animationMap?.[key] ?? key),
    ...fighter.moves.map(move => animationMap?.[move.id] ??
      (move.animationRole ? animationMap?.[move.animationRole] : undefined) ??
      move.animationRole ?? move.id),
  ];
  return [...new Set(required.filter(clipName => !available.has(clipName)))];
}
