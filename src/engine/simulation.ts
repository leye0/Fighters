/**
 * Authoritative 2.5D fighting simulation.
 * Coordinates, velocities and timing are integers. Rendering, Mixamo and audio
 * must consume events; they never decide whether a hit succeeds.
 */
export const TICKS_PER_SECOND = 60;

export type Direction = -1 | 0 | 1;
export type Facing = -1 | 1;
export type AttackButton = "LP" | "MP" | "HP" | "LK" | "MK" | "HK";
export type GuardLevel = "mid" | "low" | "overhead";
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
  readonly stunRemainingTicks: number;
}

export interface MatchState {
  readonly tick: number;
  readonly phase: "fight" | "ko";
  readonly fighters: readonly [FighterState, FighterState];
}

export type CombatEvent =
  | { readonly type: "jump"; readonly fighter: 0 | 1 }
  | { readonly type: "attack"; readonly fighter: 0 | 1; readonly moveId: string }
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
    stunRemainingTicks: 0,
  })) as unknown as [FighterState, FighterState];
  return { tick: 0, phase: "fight", fighters };
}

function moveById(config: FighterDefinition, id: string | null): MoveDefinition | undefined {
  return id === null ? undefined : config.moves.find((move) => move.id === id);
}

function clamp(x: number, left: number, right: number): number {
  return Math.max(left, Math.min(right, x));
}

function moveFighter(
  previous: FighterState,
  input: InputFrame,
  config: FighterDefinition,
  stage: StageDefinition,
  index: 0 | 1,
  events: CombatEvent[],
): FighterState {
  let f = { ...previous };
  if (f.action === "ko") return f;

  if (f.action === "hitstun" || f.action === "blockstun") {
    f = { ...f, stunRemainingTicks: f.stunRemainingTicks - 1 };
    if (f.stunRemainingTicks <= 0) f = { ...f, action: "idle", stunRemainingTicks: 0 };
    return f;
  }

  if (f.action === "attack") {
    const move = moveById(config, f.moveId);
    if (!move) throw new Error("Unknown active move: " + f.moveId);
    const frame = f.moveFrame + 1;
    if (frame >= move.startupTicks + move.activeTicks + move.recoveryTicks) {
      return { ...f, action: "idle", moveId: null, moveFrame: 0, moveHitOpponent: false };
    }
    return { ...f, moveFrame: frame };
  }

  if (f.action === "jump") {
    const nextVelocity = f.verticalVelocityMmPerTick - config.gravityMmPerTick2;
    const nextHeight = f.yMm + nextVelocity;
    f = {
      ...f,
      xMm: clamp(f.xMm + input.horizontal * config.walkSpeedMmPerTick, stage.leftMm, stage.rightMm),
      yMm: Math.max(0, nextHeight),
      verticalVelocityMmPerTick: nextVelocity,
    };
    if (nextHeight <= 0) f = { ...f, yMm: 0, verticalVelocityMmPerTick: 0, action: "idle" };
    return f;
  }

  const chosen = input.attacks.map((button) => config.moves.find((move) => move.button === button))
    .find((move): move is MoveDefinition => move !== undefined);
  if (chosen) {
    events.push({ type: "attack", fighter: index, moveId: chosen.id });
    return { ...f, action: "attack", moveId: chosen.id, moveFrame: 0, moveHitOpponent: false };
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
  const next = [
    moveFighter(previous.fighters[0], inputs[0], definition.fighters[0], definition.stage, 0, events),
    moveFighter(previous.fighters[1], inputs[1], definition.fighters[1], definition.stage, 1, events),
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
        defender.yMm > move.maxTargetHeightMm) continue;
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
  return { state: { tick: previous.tick + 1, phase, fighters: separated }, events };
}
