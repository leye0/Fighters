import type { FighterDefinition, FighterState } from "../engine/simulation.ts";

/** Resolve authoritative move ID to a character-specific clip without guessing. */
export function animationClipName(
  fighter: FighterState,
  definition?: FighterDefinition,
  animationMap?: Readonly<Record<string, string>>,
): string | null {
  const key = fighter.action === "attack" ? fighter.moveId : fighter.action;
  if (!key) return null;
  const role = fighter.action === "attack"
    ? definition?.moves.find(move => move.id === fighter.moveId)?.animationRole : undefined;
  return animationMap?.[key] ?? (role ? animationMap?.[role] : undefined) ?? role ?? key;
}
