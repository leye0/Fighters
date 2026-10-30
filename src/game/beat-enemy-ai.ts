import { NEUTRAL_BEAT_INPUT, type BeatActor, type BeatInput,
  type BeatStage, type BeatWorldState } from "../engine/beat-em-up-world.ts";

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
