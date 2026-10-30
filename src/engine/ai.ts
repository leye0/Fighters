import { MOTIONS, type DirectionCode } from "./commands.ts";
import {
  createMatch, NEUTRAL_INPUT, stepMatch, TICKS_PER_SECOND,
  type AttackButton, type FighterAction, type Facing, type FighterDefinition,
  type InputFrame, type MatchDefinition, type MatchState,
} from "./simulation.ts";

/** Seeded CPU opponents use exactly the same InputFrame and combat rules as human players. */
export type AiProfile = "aggressive" | "balanced" | "defensive";

export interface AiBrain {
  readonly seed: number;
  readonly profile: AiProfile;
  readonly nextAttackTick: number;
  readonly nextObservationTick: number;
  readonly perceivedOpponentAction: FighterAction;
  readonly guardUntilTick: number;
  readonly pendingDirections: readonly DirectionCode[];
  readonly pendingButton: AttackButton | null;
  readonly pendingFacing: Facing | null;
}

export interface AiDecision {
  readonly input: InputFrame;
  readonly brain: AiBrain;
}

const REACTION_TICKS: Readonly<Record<AiProfile, number>> = {
  aggressive: 9, balanced: 7, defensive: 6,
};
const GUARD_CHANCE_PERCENT: Readonly<Record<AiProfile, number>> = {
  aggressive: 13, balanced: 31, defensive: 55,
};

export function createAiBrain(seed: number, profile: AiProfile = "balanced"): AiBrain {
  if (!Number.isSafeInteger(seed)) throw new Error("AI seed must be a safe integer");
  if (!Object.hasOwn(REACTION_TICKS, profile)) throw new Error("Unknown AI profile");
  return {
    seed: (seed >>> 0) || 0x6d2b79f5,
    profile, nextAttackTick: 0, nextObservationTick: REACTION_TICKS[profile],
    perceivedOpponentAction: "idle", guardUntilTick: 0,
    pendingDirections: [], pendingButton: null, pendingFacing: null,
  };
}

function advanceRandom(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function motionInput(direction: DirectionCode, facing: Facing, attacks: InputFrame["attacks"]): InputFrame {
  const relative = ((direction - 1) % 3) - 1;
  const vertical = direction <= 3 ? -1 : direction >= 7 ? 1 : 0;
  return {
    horizontal: (relative * facing) as -1 | 0 | 1,
    vertical: vertical as -1 | 0 | 1,
    attacks,
  };
}

function consumeMotion(brain: AiBrain, facing: Facing): AiDecision {
  const [direction, ...pendingDirections] = brain.pendingDirections;
  const last = pendingDirections.length === 0;
  return {
    input: motionInput(direction, facing, last && brain.pendingButton ? [brain.pendingButton] : []),
    brain: {
      ...brain, pendingDirections, pendingButton: last ? null : brain.pendingButton,
      pendingFacing: last ? null : brain.pendingFacing,
    },
  };
}

/**
 * Deliberately limited perception: opponent action sampled on a fixed reaction
 * interval, no hidden future input and no privileged change to health/timing.
 */
export function decideAiInput(
  state: MatchState, index: 0 | 1, brain: AiBrain, definition: FighterDefinition,
): AiDecision {
  const tick = state.tick + 1;
  const fighter = state.fighters[index];
  const opponent = state.fighters[1 - index];
  const distance = Math.abs(opponent.xMm - fighter.xMm);
  const available = fighter.action === "idle" || fighter.action === "walk" || fighter.action === "crouch";

  let next = brain;
  if (tick >= next.nextObservationTick) {
    let guardUntilTick = next.guardUntilTick;
    let seed = next.seed;
    if (opponent.action === "attack" && next.perceivedOpponentAction !== "attack" &&
        distance <= 1550 && available) {
      seed = advanceRandom(seed);
      if (seed % 100 < GUARD_CHANCE_PERCENT[next.profile]) guardUntilTick = tick + 12;
    }
    next = {
      ...next, seed, perceivedOpponentAction: opponent.action,
      nextObservationTick: tick + REACTION_TICKS[next.profile], guardUntilTick,
    };
  }

  // Hit-confirmed chains use the same authored cancel windows as human combos.
  if (fighter.action === "attack" && fighter.moveHitOpponent && fighter.moveId) {
    const active = definition.moves.find(move => move.id === fighter.moveId);
    const frame = fighter.moveFrame + 1;
    const eligible = active?.cancelInto ? active.cancelInto.flatMap(id => definition.moves.filter(move =>
      move.id === id && !move.motion && move.stance !== "airborne" &&
      frame >= (active.cancelFromTick ?? active.startupTicks) &&
      frame <= (active.cancelThroughTick ?? active.startupTicks + active.activeTicks + active.recoveryTicks - 1),
    )) : [];
    if (eligible.length) {
      const seed = advanceRandom(next.seed);
      next = { ...next, seed };
      if (seed % 100 < 42) {
        const chosen = eligible[(seed >>> 8) % eligible.length];
        return { input: {
          horizontal: chosen.direction === "forward" ? fighter.facing :
            chosen.direction === "back" ? (fighter.facing === 1 ? -1 : 1) : 0,
          vertical: chosen.stance === "crouching" ? -1 : 0,
          attacks: chosen.buttons ?? [chosen.button],
        }, brain: next };
      }
    }
  }

  if (!available) {
    return { input: NEUTRAL_INPUT, brain: {
      ...next, pendingDirections: [], pendingButton: null, pendingFacing: null,
    } };
  }

  if (next.pendingDirections.length > 0) {
    if (next.pendingFacing === fighter.facing) return consumeMotion(next, fighter.facing);
    next = { ...next, pendingDirections: [], pendingButton: null, pendingFacing: null };
  }

  if (tick < next.guardUntilTick) {
    return {
      input: { horizontal: fighter.facing === 1 ? -1 : 1, vertical: next.seed % 3 === 0 ? -1 : 0, attacks: [] },
      brain: next,
    };
  }

  if (tick >= next.nextAttackTick && distance <= 1550) {
    const availableMoves = definition.moves.filter(move =>
      move.stance !== "airborne" && distance <= move.rangeMm - 70);
    if (availableMoves.length) {
      const seed = advanceRandom(next.seed);
      // Fair seeded variety rather than exact-scripted winners.
      const specials = availableMoves.filter(move => move.motion !== undefined &&
        MOTIONS[move.motion].length <= 6);
      const normals = availableMoves.filter(move => move.motion === undefined);
      const useSpecial = specials.length > 0 && seed % 100 <
        (next.profile === "aggressive" ? 56 : next.profile === "defensive" ? 27 : 45);
      const moves = useSpecial ? specials : normals.length ? normals : availableMoves;
      const chosen = moves[(seed >>> 8) % moves.length];
      next = {
        ...next, seed,
        nextAttackTick: tick + chosen.startupTicks + chosen.activeTicks +
          chosen.recoveryTicks + 50 + (seed % 40),
      };
      if (chosen.motion) {
        const directions = MOTIONS[chosen.motion];
        return consumeMotion({
          ...next, pendingDirections: directions, pendingButton: chosen.button,
          pendingFacing: fighter.facing,
        }, fighter.facing);
      }
      return {
        input: {
          horizontal: chosen.direction === "forward" ? fighter.facing :
            chosen.direction === "back" ? (fighter.facing === 1 ? -1 : 1) : 0,
          vertical: chosen.stance === "crouching" ? -1 : 0,
          attacks: chosen.buttons ?? [chosen.button],
        },
        brain: next,
      };
    }
  }

  // Advance to engage; never directly modify the position or hit points.
  const desiredDistance = next.profile === "defensive" ? 1100 : 820;
  if (distance > desiredDistance) {
    return { input: { horizontal: fighter.facing, vertical: 0, attacks: [] }, brain: next };
  }
  if (distance < 460 && next.profile === "defensive") {
    return { input: { horizontal: fighter.facing === 1 ? -1 : 1, vertical: 0, attacks: [] }, brain: next };
  }
  return { input: NEUTRAL_INPUT, brain: next };
}

export interface AiBattleReport {
  readonly seeds: readonly [number, number];
  readonly profiles: readonly [AiProfile, AiProfile];
  readonly ticks: number;
  readonly elapsedSeconds: number;
  readonly conclusion: "ko" | "time-limit";
  readonly healthRemaining: readonly [number, number];
  readonly attacks: readonly [number, number];
  readonly hits: readonly [number, number];
  readonly blocks: readonly [number, number];
  readonly specialAttacks: readonly [number, number];
  readonly cancels: readonly [number, number];
  readonly longestNoContactTicks: number;
  /** Automated signals, not a substitute for human visual/game-feel QA. */
  readonly diagnosticWarnings: readonly string[];
}

export function runAiBattle(
  definition: MatchDefinition,
  seeds: readonly [number, number],
  profiles: readonly [AiProfile, AiProfile] = ["aggressive", "balanced"],
  maxTicks = 60 * 90,
): AiBattleReport {
  if (!Number.isSafeInteger(maxTicks) || maxTicks < 1 || maxTicks > 60 * 60 * 10) {
    throw new Error("Invalid AI battle tick budget");
  }
  let state = createMatch(definition);
  let brains: [AiBrain, AiBrain] = [
    createAiBrain(seeds[0], profiles[0]), createAiBrain(seeds[1], profiles[1]),
  ];
  const attacks: [number, number] = [0, 0];
  const hits: [number, number] = [0, 0];
  const blocks: [number, number] = [0, 0];
  const specialAttacks: [number, number] = [0, 0];
  const cancels: [number, number] = [0, 0];
  let lastContactTick = 0;
  let longestNoContactTicks = 0;

  for (let step = 0; step < maxTicks && state.phase === "fight"; step++) {
    const a = decideAiInput(state, 0, brains[0], definition.fighters[0]);
    const b = decideAiInput(state, 1, brains[1], definition.fighters[1]);
    brains = [a.brain, b.brain];
    const result = stepMatch(state, [a.input, b.input], definition);
    state = result.state;
    for (const event of result.events) {
      if (event.type === "attack") {
        attacks[event.fighter]++;
        if (definition.fighters[event.fighter].moves.some(
          move => move.id === event.moveId && move.motion !== undefined,
        )) specialAttacks[event.fighter]++;
      } else if (event.type === "cancel") {
        cancels[event.fighter]++;
      } else if (event.type === "hit" || event.type === "block") {
        (event.type === "hit" ? hits : blocks)[event.attacker]++;
        longestNoContactTicks = Math.max(longestNoContactTicks, state.tick - lastContactTick);
        lastContactTick = state.tick;
      }
    }
  }
  longestNoContactTicks = Math.max(longestNoContactTicks, state.tick - lastContactTick);
  const warnings: string[] = [];
  if (state.phase !== "ko") warnings.push("No KO before the tick budget");
  if (Math.min(...attacks) < 4) warnings.push("One fighter attempted fewer than four attacks");
  if (hits[0] + hits[1] + blocks[0] + blocks[1] < 6) warnings.push("Few successful contacts");
  if (longestNoContactTicks > TICKS_PER_SECOND * 12) warnings.push("Long interval without contact");
  if (specialAttacks[0] + specialAttacks[1] < 2) warnings.push("Few special moves");
  return {
    seeds, profiles, ticks: state.tick,
    elapsedSeconds: Math.round(state.tick / TICKS_PER_SECOND * 100) / 100,
    conclusion: state.phase === "ko" ? "ko" : "time-limit",
    healthRemaining: [state.fighters[0].health, state.fighters[1].health],
    attacks, hits, blocks, specialAttacks, cancels, longestNoContactTicks,
    diagnosticWarnings: warnings,
  };
}
