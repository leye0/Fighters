/**
 * Authoritative 2.5D fighting simulation.
 * Coordinates, velocities and timing are integers. Rendering, Mixamo and audio
 * must consume events; they never decide whether a hit succeeds.
 */
import { directionCode, matchesMotion, MOTIONS, type MotionName, type MotionSample } from "./commands.ts";

export const TICKS_PER_SECOND = 60;
/** Keep enough history for double motions, with a bounded replay state. */
export const INPUT_HISTORY_TICKS = 32;

export type Direction = -1 | 0 | 1;
export type Facing = -1 | 1;
export type AttackButton = "LP" | "MP" | "HP" | "LK" | "MK" | "HK";
export type GuardLevel = "mid" | "low" | "overhead";
export type MoveStance = "grounded" | "standing" | "crouching" | "airborne";
export type FighterAction =
  | "idle" | "walk" | "crouch" | "jump" | "attack"
  | "hitstun" | "blockstun" | "ko";

export interface MoveDefinition {
  readonly id: string;
  readonly button: AttackButton;
  readonly startupTicks: number;
  readonly activeTicks: number;
  readonly recoveryTicks: number;
  readonly damage: number;
  readonly chipDamage: number;
  readonly rangeMm: number;
  readonly maxTargetHeightMm: number;
  readonly level: GuardLevel;
  readonly hitstunTicks: number;
  readonly blockstunTicks: number;
  readonly pushbackMm: number;
  /** Optional facing-relative command; omitted for normal attacks. */
  readonly motion?: MotionName;
  /** Higher numbers win when multiple special commands complete together. */
  readonly commandPriority?: number;
  /** Chord of simultaneous just-pressed buttons; must include the primary button. */
  readonly buttons?: readonly AttackButton[];
  /** Optional position and facing requirements for command normals. */
  readonly stance?: MoveStance;
  readonly direction?: "forward" | "back";
  /** Semantic clip role, resolved through per-character animation mappings. */
  readonly animationRole?: string;
  readonly motionWindowTicks?: number;
  /** Follow-ups are only allowed after this move makes contact, in the given frame window. */
  readonly cancelInto?: readonly string[];
  readonly cancelFromTick?: number;
  readonly cancelThroughTick?: number;
  /** Optional vertical collision constraints for anti-air and airborne moves. */
  readonly minTargetHeightMm?: number;
  readonly maxVerticalSeparationMm?: number;
  /** Percent of authored walking speed allowed during this attack (0..100). */
  readonly groundMovementPercent?: number;
  /** Percent of normal midair steering allowed during this attack (0..100). */
  readonly airControlPercent?: number;
  /** Animation uses torso/arms on top of a separate lower-body locomotion clip. */
  readonly animationLayer?: "upperBody" | "fullBody";
  /** Allow a grounded strike to keep playing when its fighter initiates a jump. */
  readonly allowJumpDuringAttack?: boolean;
}

export interface FighterDefinition {
  readonly id: string;
  readonly maxHealth: number;
  readonly walkSpeedMmPerTick: number;
  readonly jumpSpeedMmPerTick: number;
  readonly gravityMmPerTick2: number;
  readonly pushboxHalfWidthMm: number;
  readonly moves: readonly MoveDefinition[];
}

export interface StageDefinition {
  readonly leftMm: number;
  readonly rightMm: number;
  readonly spawnDistanceMm: number;
}

export interface MatchDefinition {
  readonly fighters: readonly [FighterDefinition, FighterDefinition];
  readonly stage: StageDefinition;
}

export interface InputFrame {
  readonly horizontal: Direction;
  readonly vertical: Direction;
  /** Just-pressed buttons for this simulation tick, not held buttons. */
  readonly attacks: readonly AttackButton[];
}

export interface FighterState {
  readonly id: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly verticalVelocityMmPerTick: number;
  readonly facing: Facing;
  readonly health: number;
  readonly action: FighterAction;
  readonly moveId: string | null;
  readonly moveFrame: number;
  readonly moveHitOpponent: boolean;
  readonly attackJumpUsed: boolean;
  readonly stunRemainingTicks: number;
}

export interface MatchState {
  readonly tick: number;
  readonly phase: "fight" | "ko";
  readonly fighters: readonly [FighterState, FighterState];
  /** Facing-relative direction changes are authoritative and replayable. */
  readonly inputHistory: readonly [readonly MotionSample[], readonly MotionSample[]];
}

export type CombatEvent =
  | { readonly type: "jump"; readonly fighter: 0 | 1 }
  | { readonly type: "attack"; readonly fighter: 0 | 1; readonly moveId: string }
  | { readonly type: "cancel"; readonly fighter: 0 | 1; readonly fromMoveId: string; readonly toMoveId: string }
  | { readonly type: "hit" | "block"; readonly attacker: 0 | 1; readonly defender: 0 | 1; readonly moveId: string; readonly damage: number }
  | { readonly type: "ko"; readonly fighter: 0 | 1 };

export interface StepResult {
  readonly state: MatchState;
  readonly events: readonly CombatEvent[];
}

export const NEUTRAL_INPUT: InputFrame = Object.freeze({
  horizontal: 0,
  vertical: 0,
  attacks: Object.freeze([] as AttackButton[]),
});

function assertInt(value: number, name: string, min = 0): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(name + " must be a safe integer >= " + min);
  }
}

export function validateMatchDefinition(definition: MatchDefinition): void {
  const { stage, fighters } = definition;
  assertInt(stage.leftMm, "stage.leftMm", -Number.MAX_SAFE_INTEGER);
  assertInt(stage.rightMm, "stage.rightMm", -Number.MAX_SAFE_INTEGER);
  assertInt(stage.spawnDistanceMm, "stage.spawnDistanceMm", 1);
  if (stage.leftMm >= stage.rightMm || stage.spawnDistanceMm >= stage.rightMm - stage.leftMm) {
    throw new Error("Invalid stage bounds/spawn distance");
  }
  if (fighters[0].id === fighters[1].id) throw new Error("Fighter instance IDs must be distinct");
  for (const f of fighters) {
    assertInt(f.maxHealth, "maxHealth", 1);
    assertInt(f.walkSpeedMmPerTick, "walkSpeedMmPerTick", 1);
    assertInt(f.jumpSpeedMmPerTick, "jumpSpeedMmPerTick", 1);
    assertInt(f.gravityMmPerTick2, "gravityMmPerTick2", 1);
    assertInt(f.pushboxHalfWidthMm, "pushboxHalfWidthMm", 1);
    const ids = new Set<string>();
    for (const move of f.moves) {
      if (!move.id || ids.has(move.id)) throw new Error("Move IDs must be unique and nonempty");
      ids.add(move.id);
      for (const [name, min] of [
        ["startupTicks", 0], ["activeTicks", 1], ["recoveryTicks", 0],
        ["damage", 0], ["chipDamage", 0], ["rangeMm", 1],
        ["maxTargetHeightMm", 0], ["hitstunTicks", 0], ["blockstunTicks", 0],
        ["pushbackMm", 0],
      ] as const) assertInt(move[name], move.id + "." + name, min);
      if (move.chipDamage > move.damage) throw new Error("Chip damage exceeds full damage");
      if (move.motion !== undefined && !Object.hasOwn(MOTIONS, move.motion)) {
        throw new Error("Unknown motion: " + move.motion);
      }
      if (move.commandPriority !== undefined) assertInt(move.commandPriority, move.id + ".commandPriority");
      if (move.motionWindowTicks !== undefined) assertInt(move.motionWindowTicks, move.id + ".motionWindowTicks", 1);
      if (move.minTargetHeightMm !== undefined) assertInt(move.minTargetHeightMm, move.id + ".minTargetHeightMm");
      if (move.maxVerticalSeparationMm !== undefined) assertInt(move.maxVerticalSeparationMm, move.id + ".maxVerticalSeparationMm", 1);
      for (const name of ["groundMovementPercent", "airControlPercent"] as const) {
        if (move[name] !== undefined) {
          assertInt(move[name], move.id + "." + name);
          if (move[name] > 100) throw new Error(move.id + "." + name + " exceeds 100%");
        }
      }
      if (move.animationLayer && move.animationLayer !== "upperBody" && move.animationLayer !== "fullBody") {
        throw new Error("Unknown animation layer: " + move.id);
      }
      if (move.allowJumpDuringAttack !== undefined && typeof move.allowJumpDuringAttack !== "boolean") {
        throw new Error("Invalid jump-during-attack flag: " + move.id);
      }
      if (move.allowJumpDuringAttack && move.animationLayer !== "upperBody") {
        throw new Error("Jumping during attack requires upper-body layering: " + move.id);
      }
      if (move.cancelFromTick !== undefined) assertInt(move.cancelFromTick, move.id + ".cancelFromTick");
      if (move.cancelThroughTick !== undefined) assertInt(move.cancelThroughTick, move.id + ".cancelThroughTick");
      if (move.cancelFromTick !== undefined && move.cancelThroughTick !== undefined && move.cancelFromTick > move.cancelThroughTick) throw new Error("Invalid cancel window");
      if (move.buttons && (move.buttons.length < 2 || !move.buttons.includes(move.button) || new Set(move.buttons).size !== move.buttons.length)) throw new Error("Invalid button chord");
      if (move.animationRole !== undefined && !move.animationRole.trim()) throw new Error("Empty animation role");
      if (move.stance && !["grounded", "standing", "crouching", "airborne"].includes(move.stance)) throw new Error("Invalid move stance");
      if (move.direction && move.direction !== "forward" && move.direction !== "back") throw new Error("Invalid command direction");
      if (move.minTargetHeightMm !== undefined && move.minTargetHeightMm > move.maxTargetHeightMm) throw new Error("Impossible target height");
      const total = move.startupTicks + move.activeTicks + move.recoveryTicks;
      if (move.cancelFromTick !== undefined && move.cancelFromTick >= total) throw new Error("Unreachable cancel start");
      if (move.cancelThroughTick !== undefined && move.cancelThroughTick >= total) throw new Error("Unreachable cancel end");
    }
    for (const move of f.moves) {
      if (move.cancelInto?.some(id => !ids.has(id) || id === move.id)) throw new Error("Invalid cancel destination for " + move.id);
    }
  }
  const requiredDistance = fighters[0].pushboxHalfWidthMm + fighters[1].pushboxHalfWidthMm;
  if (stage.spawnDistanceMm < requiredDistance || stage.rightMm - stage.leftMm < requiredDistance) {
    throw new Error("Stage cannot fit the fighters");
  }
}

export function createMatch(definition: MatchDefinition): MatchState {
  validateMatchDefinition(definition);
  const center = Math.trunc((definition.stage.leftMm + definition.stage.rightMm) / 2);
  const half = Math.trunc(definition.stage.spawnDistanceMm / 2);
  const positions = [center - half, center + definition.stage.spawnDistanceMm - half] as const;
  const fighters = definition.fighters.map((config, index): FighterState => ({
    id: config.id,
    xMm: positions[index],
    yMm: 0,
    verticalVelocityMmPerTick: 0,
    facing: index === 0 ? 1 : -1,
    health: config.maxHealth,
    action: "idle",
    moveId: null,
    moveFrame: 0,
    moveHitOpponent: false,
    attackJumpUsed: false,
    stunRemainingTicks: 0,
  })) as unknown as [FighterState, FighterState];
  return { tick: 0, phase: "fight", fighters, inputHistory: [[], []] };
}

function moveById(config: FighterDefinition, id: string | null): MoveDefinition | undefined {
  return id === null ? undefined : config.moves.find((move) => move.id === id);
}

function clamp(x: number, left: number, right: number): number {
  return Math.max(left, Math.min(right, x));
}

/** Only direction transitions count: holding the final direction cannot refresh an expired command. */
function recordDirection(
  history: readonly MotionSample[], input: InputFrame, facing: Facing, tick: number,
): readonly MotionSample[] {
  const recent = history.filter(sample => sample.tick >= tick - INPUT_HISTORY_TICKS);
  const code = directionCode(input, facing);
  if (recent.at(-1)?.direction === code) return recent;
  return [...recent, { tick, direction: code }];
}

/** A normal, command normal, chord or special is always selected from authored data. */
function resolveAttackMove(
  moves: readonly MoveDefinition[], input: InputFrame,
  history: readonly MotionSample[], tick: number, facing: Facing,
  airborne: boolean,
): MoveDefinition | undefined {
  if (!input.attacks.length) return undefined;
  const stance: MoveStance = airborne ? "airborne" : input.vertical === -1 ? "crouching" : "standing";
  let chosen: MoveDefinition | undefined;
  let chosenScore = -1;
  for (const move of moves) {
    if (move.stance !== undefined && move.stance !== stance && !(move.stance === "grounded" && !airborne)) continue;
    if (move.buttons ? !move.buttons.every(button => input.attacks.includes(button)) : !input.attacks.includes(move.button)) continue;
    if (move.direction && input.horizontal !== (move.direction === "forward" ? facing : -facing)) continue;
    if (move.motion && !matchesMotion(history, MOTIONS[move.motion], tick, move.motionWindowTicks ?? 16)) continue;
    const score = (move.commandPriority ?? 0) * 1000 +
      (move.motion ? 100 + MOTIONS[move.motion].length : 0) +
      (move.buttons ? move.buttons.length * 10 : 0) +
      (move.direction ? 5 : 0) + (move.stance ? 1 : 0);
    if (score > chosenScore) { chosen = move; chosenScore = score; }
  }
  return chosen;
}

/** Gravity remains active while an attack or reaction takes place in the air. */
function integrateAir(
  fighter: FighterState, input: InputFrame, config: FighterDefinition, stage: StageDefinition,
  controlPercent = 100,
): FighterState {
  if (fighter.yMm <= 0) return fighter;
  const velocity = fighter.verticalVelocityMmPerTick - config.gravityMmPerTick2;
  const height = Math.max(0, fighter.yMm + velocity);
  return {
    ...fighter, yMm: height, verticalVelocityMmPerTick: height > 0 ? velocity : 0,
    xMm: clamp(fighter.xMm + Math.trunc(input.horizontal * config.walkSpeedMmPerTick * controlPercent / 100), stage.leftMm, stage.rightMm),
  };
}

/** Attack movement is simulation-owned; visual root motion cannot alter hitboxes. */
function integrateAttackMovement(
  fighter: FighterState, input: InputFrame, config: FighterDefinition,
  stage: StageDefinition, move: MoveDefinition,
): FighterState {
  if (fighter.yMm > 0) {
    return integrateAir(fighter, input, config, stage, move.airControlPercent ?? 100);
  }
  return {
    ...fighter,
    xMm: clamp(
      fighter.xMm + Math.trunc(input.horizontal * config.walkSpeedMmPerTick * (move.groundMovementPercent ?? 0) / 100),
      stage.leftMm, stage.rightMm,
    ),
  };
}

function moveFighter(
  previous: FighterState,
  input: InputFrame,
  config: FighterDefinition,
  stage: StageDefinition,
  index: 0 | 1,
  events: CombatEvent[],
  history: readonly MotionSample[],
  tick: number,
): FighterState {
  let f = { ...previous };
  if (f.action === "ko") return f;

  if (f.action === "hitstun" || f.action === "blockstun") {
    f = { ...integrateAir(f, NEUTRAL_INPUT, config, stage), stunRemainingTicks: f.stunRemainingTicks - 1 };
    if (f.stunRemainingTicks <= 0) f = { ...f, action: "idle", stunRemainingTicks: 0 };
    return f;
  }

  if (f.action === "attack") {
    const move = moveById(config, f.moveId);
    if (!move) throw new Error("Unknown active move: " + f.moveId);
    if (move.allowJumpDuringAttack && !f.attackJumpUsed && f.yMm === 0 && input.vertical === 1) {
      f = { ...f, yMm: config.jumpSpeedMmPerTick,
        verticalVelocityMmPerTick: config.jumpSpeedMmPerTick, attackJumpUsed: true };
      events.push({ type: "jump", fighter: index });
    }
    const frame = f.moveFrame + 1;
    const followup = move.cancelInto?.length && f.moveHitOpponent
      ? resolveAttackMove(config.moves, input, history, tick, f.facing, f.yMm > 0)
      : undefined;
    if (followup && move.cancelInto?.includes(followup.id) &&
        frame >= (move.cancelFromTick ?? move.startupTicks) &&
        frame <= (move.cancelThroughTick ?? move.startupTicks + move.activeTicks + move.recoveryTicks - 1)) {
      events.push({ type: "cancel", fighter: index, fromMoveId: move.id, toMoveId: followup.id });
      events.push({ type: "attack", fighter: index, moveId: followup.id });
      return { ...integrateAttackMovement(f, input, config, stage, followup), action: "attack",
        moveId: followup.id, moveFrame: 0, moveHitOpponent: false, attackJumpUsed: f.attackJumpUsed };
    }
    f = integrateAttackMovement(f, input, config, stage, move);
    if (frame >= move.startupTicks + move.activeTicks + move.recoveryTicks) {
      return { ...f, action: f.yMm > 0 ? "jump" : "idle", moveId: null,
        moveFrame: 0, moveHitOpponent: false, attackJumpUsed: false };
    }
    return { ...f, moveFrame: frame };
  }

  if (f.action === "jump") {
    const chosen = resolveAttackMove(config.moves, input, history, tick, f.facing, true);
    f = integrateAir(f, input, config, stage);
    if (chosen && f.yMm > 0) {
      events.push({ type: "attack", fighter: index, moveId: chosen.id });
      return { ...f, action: "attack", moveId: chosen.id, moveFrame: 0, moveHitOpponent: false, attackJumpUsed: false };
    }
    if (f.yMm <= 0) f = { ...f, action: "idle" };
    return f;
  }

  const chosen = resolveAttackMove(config.moves, input, history, tick, f.facing, false);
  if (chosen) {
    events.push({ type: "attack", fighter: index, moveId: chosen.id });
    if (chosen.allowJumpDuringAttack && input.vertical === 1) {
      events.push({ type: "jump", fighter: index });
      return { ...f, action: "attack", yMm: config.jumpSpeedMmPerTick,
        verticalVelocityMmPerTick: config.jumpSpeedMmPerTick, moveId: chosen.id,
        moveFrame: 0, moveHitOpponent: false, attackJumpUsed: true };
    }
    return { ...integrateAttackMovement(f, input, config, stage, chosen),
      action: "attack", moveId: chosen.id, moveFrame: 0, moveHitOpponent: false, attackJumpUsed: false };
  }
  if (input.vertical === 1) {
    events.push({ type: "jump", fighter: index });
    return {
      ...f, action: "jump", yMm: config.jumpSpeedMmPerTick,
      verticalVelocityMmPerTick: config.jumpSpeedMmPerTick,
    };
  }
  if (input.vertical === -1) return { ...f, action: "crouch" };
  if (input.horizontal !== 0) {
    return {
      ...f,
      action: "walk",
      xMm: clamp(f.xMm + input.horizontal * config.walkSpeedMmPerTick, stage.leftMm, stage.rightMm),
    };
  }
  return { ...f, action: "idle" };
}

function resolvePushboxes(
  fighters: [FighterState, FighterState],
  config: MatchDefinition,
): [FighterState, FighterState] {
  const [a, b] = fighters;
  const sum = config.fighters[0].pushboxHalfWidthMm + config.fighters[1].pushboxHalfWidthMm;
  const distance = Math.abs(b.xMm - a.xMm);
  if (distance >= sum) return fighters;
  const leftIndex = a.xMm <= b.xMm ? 0 : 1;
  const rightIndex = leftIndex === 0 ? 1 : 0;
  const left = { ...fighters[leftIndex] }, right = { ...fighters[rightIndex] };
  let overlap = sum - distance;
  const leftRoom = left.xMm - config.stage.leftMm;
  const shiftLeft = Math.min(Math.ceil(overlap / 2), leftRoom);
  left.xMm -= shiftLeft;
  overlap -= shiftLeft;
  const rightRoom = config.stage.rightMm - right.xMm;
  const shiftRight = Math.min(overlap, rightRoom);
  right.xMm += shiftRight;
  overlap -= shiftRight;
  if (overlap > 0) left.xMm -= Math.min(overlap, left.xMm - config.stage.leftMm);
  return leftIndex === 0 ? [left, right] : [right, left];
}

function isBlocking(input: InputFrame, defender: FighterState, level: GuardLevel): boolean {
  if (defender.action !== "idle" && defender.action !== "walk" && defender.action !== "crouch") {
    return false;
  }
  const holdingBack = input.horizontal === -defender.facing;
  if (!holdingBack) return false;
  if (level === "low") return input.vertical === -1;
  if (level === "overhead") return input.vertical !== -1;
  return true;
}

interface PendingHit {
  readonly attacker: 0 | 1;
  readonly defender: 0 | 1;
  readonly move: MoveDefinition;
  readonly guarded: boolean;
}

export function stepMatch(
  previous: MatchState,
  inputs: readonly [InputFrame, InputFrame],
  definition: MatchDefinition,
): StepResult {
  if (previous.phase === "ko") return { state: previous, events: [] };
  const events: CombatEvent[] = [];
  const tick = previous.tick + 1;
  const histories = [
    recordDirection(previous.inputHistory[0], inputs[0], previous.fighters[0].facing, tick),
    recordDirection(previous.inputHistory[1], inputs[1], previous.fighters[1].facing, tick),
  ] as const;
  const next = [
    moveFighter(previous.fighters[0], inputs[0], definition.fighters[0], definition.stage, 0, events, histories[0], tick),
    moveFighter(previous.fighters[1], inputs[1], definition.fighters[1], definition.stage, 1, events, histories[1], tick),
  ] as [FighterState, FighterState];
  const positioned = resolvePushboxes(next, definition);
  const [left, right] = positioned;
  const facing: [Facing, Facing] = left.xMm < right.xMm
    ? [1, -1] : left.xMm > right.xMm ? [-1, 1] : [left.facing, right.facing];
  const fighters = positioned.map((fighter, index) => ({ ...fighter, facing: facing[index] })) as [FighterState, FighterState];

  // Find hits from the same pre-hit snapshot: trades are resolved simultaneously.
  const pending: PendingHit[] = [];
  for (const index of [0, 1] as const) {
    const attacker = fighters[index];
    const defenderIndex = (1 - index) as 0 | 1;
    const defender = fighters[defenderIndex];
    const move = moveById(definition.fighters[index], attacker.moveId);
    if (!move || attacker.action !== "attack" || attacker.moveHitOpponent) continue;
    if (attacker.moveFrame < move.startupTicks ||
        attacker.moveFrame >= move.startupTicks + move.activeTicks) continue;
    if (Math.abs(attacker.xMm - defender.xMm) > move.rangeMm ||
        defender.yMm > move.maxTargetHeightMm ||
        defender.yMm < (move.minTargetHeightMm ?? 0) ||
        Math.abs(attacker.yMm - defender.yMm) > (move.maxVerticalSeparationMm ?? Number.MAX_SAFE_INTEGER)) continue;
    pending.push({
      attacker: index, defender: defenderIndex, move,
      guarded: isBlocking(inputs[defenderIndex], defender, move.level),
    });
  }

  for (const hit of pending) {
    const defender = fighters[hit.defender];
    const damage = hit.guarded ? hit.move.chipDamage : hit.move.damage;
    const health = Math.max(0, defender.health - damage);
    const stun = hit.guarded ? hit.move.blockstunTicks : hit.move.hitstunTicks;
    fighters[hit.defender] = {
      ...defender, health,
      action: health === 0 ? "ko" : stun > 0 ? (hit.guarded ? "blockstun" : "hitstun") : "idle",
      stunRemainingTicks: stun,
      moveId: null, moveFrame: 0, moveHitOpponent: false,
      xMm: clamp(defender.xMm + fighters[hit.attacker].facing * hit.move.pushbackMm, definition.stage.leftMm, definition.stage.rightMm),
    };
    fighters[hit.attacker] = { ...fighters[hit.attacker], moveHitOpponent: true };
    events.push({
      type: hit.guarded ? "block" : "hit", attacker: hit.attacker,
      defender: hit.defender, moveId: hit.move.id, damage,
    });
  }
  const phase = fighters.some((fighter) => fighter.health === 0) ? "ko" : "fight";
  if (phase === "ko") {
    for (const index of [0, 1] as const) {
      if (fighters[index].health === 0) events.push({ type: "ko", fighter: index });
    }
  }
  const separated = resolvePushboxes(fighters, definition);
  // When fighters switch sides, old facing-relative commands may not be combined
  // with commands from their new orientation.
  const inputHistory: [readonly MotionSample[], readonly MotionSample[]] = [
    separated[0].facing === previous.fighters[0].facing ? histories[0] : [],
    separated[1].facing === previous.fighters[1].facing ? histories[1] : [],
  ];
  return { state: { tick, phase, fighters: separated, inputHistory }, events };
}
