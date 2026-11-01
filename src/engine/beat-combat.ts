import {
  createBeatWorld, stepBeatWorld, NEUTRAL_BEAT_INPUT,
  type BeatActor, type BeatInput, type BeatStage, type BeatWorldState,
} from "./beat-em-up-world.ts";

/**
 * Playable demo tuning, NOT human-approved animation contact-frame metadata.
 * Durations are measured from actual baked Quaternius CC0 / ACCAD CC BY clips.
 * All hit windows, ranges, stun and damage are explicit and testable.
 */
export const DEMO_ATTACKS = {
  jab: {
    clip: "UAL1_Punch_Jab", totalTicks: 52, contactFrom: 13, contactTo: 19,
    damage: 12, rangeMm: 1250, depthMm: 680, verticalMm: 650, stunTicks: 50,
  },
  cross: {
    clip: "UAL1_Punch_Cross", totalTicks: 60, contactFrom: 19, contactTo: 27,
    damage: 20, rangeMm: 1480, depthMm: 700, verticalMm: 700, stunTicks: 50,
  },
  kickFront: {
    clip: "ACCAD_Front_Kick", totalTicks: 69, contactFrom: 24, contactTo: 32,
    damage: 18, rangeMm: 1740, depthMm: 630, verticalMm: 800, stunTicks: 60,
  },
  kickRound: {
    clip: "ACCAD_Roundhouse_Kick", totalTicks: 54, contactFrom: 19, contactTo: 27,
    damage: 23, rangeMm: 1510, depthMm: 820, verticalMm: 1150, stunTicks: 60,
  },
} as const;

export type DemoAttack = keyof typeof DEMO_ATTACKS;
export const ATTACK_ORDER: readonly DemoAttack[] = ["jab", "cross", "kickFront", "kickRound"];

export interface BeatCombatInput {
  readonly movement: BeatInput;
  readonly attack?: DemoAttack | null;
}
export interface ActiveDemoAttack {
  readonly kind: DemoAttack;
  readonly ageTicks: number;
  readonly struckIds: readonly string[];
}
export interface BeatFighterCombat {
  readonly maxHealth: number;
  readonly health: number;
  readonly stunTicks: number;
  readonly attack: ActiveDemoAttack | null;
}
export type BeatCombatEvent =
  | { readonly kind: "attack"; readonly actorId: string; readonly attack: DemoAttack }
  | { readonly kind: "hit"; readonly actorId: string; readonly damage: number;
      readonly attackerId: string; readonly attack: DemoAttack }
  | { readonly kind: "ko"; readonly actorId: string };
export type CombatOutcome = "playing" | "victory" | "defeat";

export interface BeatCombatState {
  readonly world: BeatWorldState;
  readonly fighters: Readonly<Record<string, BeatFighterCombat>>;
  readonly events: readonly BeatCombatEvent[];
  readonly outcome: CombatOutcome;
}

export function createBeatCombat(stage: BeatStage, actors: readonly BeatActor[],
  heroId = "hero"): BeatCombatState {
  const world = createBeatWorld(stage, actors);
  if (!world.actors.some(actor => actor.id === heroId && actor.team === "heroes")) {
    throw new Error("Demo combat requires a hero");
  }
  const fighters: Record<string, BeatFighterCombat> = {};
  for (const actor of world.actors) {
    const maxHealth = actor.id === heroId ? 100 : 44;
    fighters[actor.id] = { maxHealth, health: maxHealth, stunTicks: 0, attack: null };
  }
  return { world, fighters, events: [], outcome: "playing" };
}

/** Facing and X/Z/Y must ALL agree. Nearby enemies behind the hero are safe. */
export function isWithinAttackVolume(
  attacker: BeatActor, target: BeatActor, kind: DemoAttack,
): boolean {
  if (!attacker.alive || !target.alive || attacker.team === target.team) return false;
  const spec = DEMO_ATTACKS[kind];
  const forward = (target.xMm - attacker.xMm) * attacker.facing;
  return forward >= 120 && forward <= spec.rangeMm &&
    Math.abs(target.depthMm - attacker.depthMm) <= spec.depthMm &&
    Math.abs(target.heightMm - attacker.heightMm) <= spec.verticalMm;
}

function canStart(
  actor: BeatActor, fighter: BeatFighterCombat, request: DemoAttack | null | undefined,
): request is DemoAttack {
  return Boolean(actor.alive && fighter.health > 0 && fighter.stunTicks === 0 &&
    fighter.attack === null && actor.supportingPlatformId !== null &&
    request && Object.hasOwn(DEMO_ATTACKS, request));
}

/** Deterministic 60 Hz contact simulation; no skeleton-driven damage or pushboxes. */
export function stepBeatCombat(
  prior: BeatCombatState, commands: Readonly<Record<string, BeatCombatInput>>,
  stage: BeatStage, heroId = "hero",
): BeatCombatState {
  if (prior.outcome !== "playing") return { ...prior, events: [] };
  const movement: Record<string, BeatInput> = {};
  for (const actor of prior.world.actors) {
    const fighter = prior.fighters[actor.id];
    const input = commands[actor.id]?.movement ?? NEUTRAL_BEAT_INPUT;
    movement[actor.id] = fighter.health <= 0 || fighter.stunTicks > 0
      ? NEUTRAL_BEAT_INPUT
      // No misleading upper-body layering: full-body attacks temporarily stop
      // input-driven travel while the authored strike plays.
      : fighter.attack ? { horizontal: 0, depth: 0, jump: false } : input;
  }
  const world = stepBeatWorld(prior.world, movement, stage);
  const snapshots: Record<string, BeatFighterCombat> = {};
  const events: BeatCombatEvent[] = [];
  for (const actor of world.actors) {
    const previous = prior.fighters[actor.id];
    let attack: ActiveDemoAttack | null = null;
    if (previous.stunTicks === 0) {
      if (previous.attack) {
        const age = previous.attack.ageTicks + 1;
        if (age < DEMO_ATTACKS[previous.attack.kind].totalTicks) {
          attack = { ...previous.attack, ageTicks: age };
        }
      } else {
        const desired = commands[actor.id]?.attack;
        if (canStart(actor, previous, desired)) {
          attack = { kind: desired, ageTicks: 0, struckIds: [] };
          events.push({ kind: "attack", actorId: actor.id, attack: desired });
        }
      }
    }
    snapshots[actor.id] = {
      ...previous, stunTicks: Math.max(0, previous.stunTicks - 1), attack,
    };
  }

  // Resolve ALL active contacts from the same pre-damage state. Mutual
  // strikes can trade. One attack may hit multiple hostiles, but never twice
  // against the same actor.
  const damage = new Map<string, { amount: number; attackerId: string; attack: DemoAttack;
    stunTicks: number }>();
  for (const actor of world.actors) {
    const attack = snapshots[actor.id].attack;
    if (!attack) continue;
    const spec = DEMO_ATTACKS[attack.kind];
    if (attack.ageTicks < spec.contactFrom || attack.ageTicks > spec.contactTo) continue;
    const struck = new Set(attack.struckIds);
    for (const target of world.actors) {
      if (struck.has(target.id) || !isWithinAttackVolume(actor, target, attack.kind)) continue;
      struck.add(target.id);
      const previous = damage.get(target.id);
      damage.set(target.id, {
        amount: (previous?.amount ?? 0) + spec.damage,
        attackerId: actor.id, attack: attack.kind,
        stunTicks: Math.max(previous?.stunTicks ?? 0, spec.stunTicks),
      });
    }
    snapshots[actor.id] = { ...snapshots[actor.id],
      attack: { ...attack, struckIds: [...struck] } };
  }

  for (const actor of world.actors) {
    const hit = damage.get(actor.id);
    if (!hit) continue;
    const before = snapshots[actor.id];
    const health = Math.max(0, before.health - hit.amount);
    snapshots[actor.id] = { ...before, health,
      stunTicks: health > 0 ? hit.stunTicks : 0, attack: null };
    events.push({ kind: "hit", actorId: actor.id, damage: hit.amount,
      attackerId: hit.attackerId, attack: hit.attack });
    if (health === 0) events.push({ kind: "ko", actorId: actor.id });
  }

  const actors = world.actors.map(actor =>
    snapshots[actor.id].health <= 0 ? { ...actor, alive: false, targetId: null } : actor);
  const hero = snapshots[heroId];
  if (!hero) throw new Error("Combat hero was removed");
  const outcome: CombatOutcome = hero.health <= 0 ? "defeat"
    : actors.every(a => a.id === heroId || a.team === "heroes" || !a.alive) ? "victory" : "playing";
  return { world: { ...world, actors }, fighters: snapshots, events, outcome };
}
