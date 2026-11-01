import { NEUTRAL_BEAT_INPUT, type BeatActor, type BeatInput,
  type BeatStage, type BeatWorldState } from "../engine/beat-em-up-world.ts";
import { isWithinAttackVolume, type BeatCombatInput, type BeatCombatState } from
  "../engine/beat-combat.ts";

/** Simple deterministic demo navigation. These are *intentions*, not contacts:
 * enemies stop near a hero because they choose to, never due to pushboxes.
 * The world applies the same stage boundaries and platform rules to everyone.
 */
export function demoEnemyInputs(
  world: BeatWorldState, stage: BeatStage, heroId = "hero",
): Readonly<Record<string, BeatInput>> {
  const hero = world.actors.find(a => a.id === heroId);
  if (!hero || !hero.alive) return {};
  const result: Record<string, BeatInput> = {};
  for (const enemy of world.actors) {
    if (!enemy.alive || enemy.team === hero.team) continue;
    const dx = hero.xMm - enemy.xMm;
    const dz = hero.depthMm - enemy.depthMm;
    // Keep a readable fighting gap rather than continuously standing inside
    // the hero. This is an AI choice; the physics permits any overlap.
    const horizontal = Math.abs(dx) > 1100 ? Math.sign(dx) as -1 | 1 : 0;
    const depth = Math.abs(dz) > 650 ? Math.sign(dz) as -1 | 1 : 0;
    const onSameHeight = Math.abs(hero.heightMm - enemy.heightMm) <= stage.stepUpMm;
    result[enemy.id] = onSameHeight
      ? { horizontal, depth, jump: false }
      : NEUTRAL_BEAT_INPUT;
  }
  return result;
}

/** Multiple enemies choose movements and independently timed real attacks. */
export function demoEnemyCombatInputs(
  combat: BeatCombatState, stage: BeatStage, heroId = "hero",
): Readonly<Record<string, BeatCombatInput>> {
  const hero = combat.world.actors.find(a => a.id === heroId);
  if (!hero?.alive || combat.outcome !== "playing") return {};
  const movement = demoEnemyInputs(combat.world, stage, heroId);
  const result: Record<string, BeatCombatInput> = {};
  let index = 0;
  for (const enemy of combat.world.actors) {
    if (!enemy.alive || enemy.team === hero.team) continue;
    const fighter = combat.fighters[enemy.id];
    const dx = hero.xMm - enemy.xMm;
    const desiredFacing = Math.sign(dx) as -1 | 0 | 1;
    const basic = movement[enemy.id] ?? NEUTRAL_BEAT_INPUT;
    // Physically step to turn. Never write the actor's facing from a target.
    const turn = desiredFacing !== 0 && desiredFacing !== enemy.facing &&
      Math.abs(dx) > 200 ? desiredFacing : 0;
    result[enemy.id] = {
      movement: turn ? { ...basic, horizontal: turn } : basic,
      attack: fighter.attack || fighter.stunTicks > 0 ||
        (combat.world.tick + 31 * index) % 92 !== 40 ||
        !isWithinAttackVolume(enemy, hero, "jab") ? null : "jab",
    };
    index++;
  }
  return result;
}
