/** Authoritative, deterministic *kinematic* traversal for Fighters' beat'em up.
 * x = route progression, depth = near/far lane, height = actual world elevation.
 * All coordinates and velocities are integer millimeters per 60 Hz tick.
 * Actors intentionally have no rigid-body collision or mutual pushboxes:
 * heroes and enemies may overlap/cross. Combat uses separate hit tests.
 * Platforms are scripted supports, not outputs of a physics solver.
 * This is distinct from the legacy two-fighter arena benchmark.
 */
export type Axis = -1 | 0 | 1;
export type Facing = -1 | 1;

export interface WalkablePlatform {
  readonly id: string;
  readonly leftMm: number;
  readonly rightMm: number;
  readonly nearMm: number;
  readonly farMm: number;
  readonly topMm: number;
  /** Optional old-school one-way surface; a contextual drop command bypasses it. */
  readonly dropThrough?: boolean;
}

export interface BeatStage {
  readonly leftMm: number;
  readonly rightMm: number;
  readonly nearMm: number;
  readonly farMm: number;
  readonly gravityMmPerTick2: number;
  readonly stepUpMm: number;
  readonly stepDownMm: number;
  readonly targetAcquireMm: number;
  readonly targetReleaseMm: number;
  readonly targetMaxHeightMm: number;
  /** Optional deterministic arcade acceleration; never enables rigid bodies. */
  readonly movement?: Readonly<{
    groundAccelerationMmPerTick2: number;
    groundBrakingMmPerTick2: number;
    airAccelerationMmPerTick2: number;
    airBrakingMmPerTick2: number;
  }>;
  readonly platforms: readonly WalkablePlatform[];
}

export interface BeatActor {
  readonly id: string;
  readonly team: string;
  readonly alive: boolean;
  readonly xMm: number;
  readonly depthMm: number;
  readonly heightMm: number;
  readonly verticalVelocityMmPerTick: number;
  readonly velocityXMmPerTick?: number;
  readonly velocityZMmPerTick?: number;
  readonly supportingPlatformId: string | null;
  readonly speedMmPerTick: number;
  readonly jumpSpeedMmPerTick: number;
  readonly facing: Facing;
  readonly targetId: string | null;
}

export interface BeatInput {
  readonly horizontal: Axis;
  readonly depth: Axis;
  readonly jump: boolean;
  /** Gameplay command, deliberately distinct from depth movement. */
  readonly drop?: boolean;
}

export interface BeatWorldState {
  readonly tick: number;
  readonly actors: readonly BeatActor[];
}

export const NEUTRAL_BEAT_INPUT: Readonly<BeatInput> = Object.freeze({
  horizontal: 0, depth: 0, jump: false,
});

function integer(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(label + " must be a safe integer >= " + minimum);
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function validateBeatStage(stage: BeatStage): void {
  for (const key of ["leftMm", "rightMm", "nearMm", "farMm"] as const) {
    integer(stage[key], key, -Number.MAX_SAFE_INTEGER);
  }
  if (stage.leftMm >= stage.rightMm || stage.nearMm >= stage.farMm) {
    throw new Error("Invalid beat'em up world bounds");
  }
  for (const key of [
    "gravityMmPerTick2", "targetAcquireMm", "targetReleaseMm", "targetMaxHeightMm",
  ] as const) integer(stage[key], key, 1);
  for (const key of ["stepUpMm", "stepDownMm"] as const) integer(stage[key], key);
  if (stage.movement) {
    for (const [key, value] of Object.entries(stage.movement)) {
      integer(value, "movement." + key, 1);
    }
  }
  if (stage.targetReleaseMm < stage.targetAcquireMm) {
    throw new Error("Target release range must cover acquisition range");
  }
  const ids = new Set<string>();
  for (const p of stage.platforms) {
    if (!p.id || ids.has(p.id)) throw new Error("Duplicate/empty platform ID");
    ids.add(p.id);
    for (const key of ["leftMm", "rightMm", "nearMm", "farMm"] as const) {
      integer(p[key], p.id + "." + key, -Number.MAX_SAFE_INTEGER);
    }
    integer(p.topMm, p.id + ".topMm");
    if (p.dropThrough !== undefined && typeof p.dropThrough !== "boolean") {
      throw new Error("Invalid platform drop-through flag: " + p.id);
    }
    if (p.leftMm >= p.rightMm || p.nearMm >= p.farMm ||
        p.leftMm < stage.leftMm || p.rightMm > stage.rightMm ||
        p.nearMm < stage.nearMm || p.farMm > stage.farMm) {
      throw new Error("Invalid platform bounds: " + p.id);
    }
  }
}

/** The highest support below a foot, with stable ID ties. */
function support(
  stage: BeatStage, xMm: number, depthMm: number, maximumHeight: number,
  ignoredPlatformId: string | null = null,
): WalkablePlatform | null {
  let winner: WalkablePlatform | null = null;
  for (const p of stage.platforms) {
    if (p.id !== ignoredPlatformId && p.leftMm <= xMm && xMm <= p.rightMm &&
        p.nearMm <= depthMm && depthMm <= p.farMm &&
        p.topMm <= maximumHeight &&
        (!winner || p.topMm > winner.topMm ||
          (p.topMm === winner.topMm && p.id < winner.id))) winner = p;
  }
  return winner;
}

/** Spawn exactly on a real surface, including a roof or a container. */
export function createBeatWorld(stage: BeatStage, actors: readonly BeatActor[]): BeatWorldState {
  validateBeatStage(stage);
  const ids = new Set<string>();
  for (const actor of actors) {
    if (!actor.id || !actor.team || ids.has(actor.id)) throw new Error("Invalid actor ID/team");
    ids.add(actor.id);
    for (const key of ["xMm", "depthMm", "heightMm", "verticalVelocityMmPerTick"] as const) {
      integer(actor[key], actor.id + "." + key,
        key === "heightMm" ? 0 : -Number.MAX_SAFE_INTEGER);
    }
    integer(actor.speedMmPerTick, actor.id + ".speedMmPerTick", 1);
    integer(actor.jumpSpeedMmPerTick, actor.id + ".jumpSpeedMmPerTick", 1);
    for (const key of ["velocityXMmPerTick", "velocityZMmPerTick"] as const) {
      if (actor[key] !== undefined) integer(actor[key], actor.id + "." + key, -Number.MAX_SAFE_INTEGER);
    }
    if (actor.xMm < stage.leftMm || actor.xMm > stage.rightMm ||
        actor.depthMm < stage.nearMm || actor.depthMm > stage.farMm) {
      throw new Error("Actor spawn outside stage: " + actor.id);
    }
    if (actor.facing !== -1 && actor.facing !== 1) throw new Error("Invalid facing");
    if (actor.supportingPlatformId) {
      const ground = support(stage, actor.xMm, actor.depthMm, Number.MAX_SAFE_INTEGER);
      if (!ground || ground.id !== actor.supportingPlatformId ||
          ground.topMm !== actor.heightMm || actor.verticalVelocityMmPerTick !== 0) {
        throw new Error("Actor must spawn on named support: " + actor.id);
      }
    }
  }
  return { tick: 0, actors: actors.map(actor => ({ ...actor })) };
}

function advance(actor: BeatActor, input: BeatInput, stage: BeatStage): BeatActor {
  if (!actor.alive) return actor;
  if (![-1, 0, 1].includes(input.horizontal) ||
      ![-1, 0, 1].includes(input.depth) || typeof input.jump !== "boolean" ||
      (input.drop !== undefined && typeof input.drop !== "boolean")) {
    throw new Error("Invalid beat'em up input for " + actor.id);
  }
  const diagonal = input.horizontal !== 0 && input.depth !== 0;
  const speed = diagonal ? Math.trunc(actor.speedMmPerTick * 181 / 256) : actor.speedMmPerTick;
  const accelerate = (current: number, target: number, limit: number): number =>
    current < target ? Math.min(current + limit, target) : Math.max(current - limit, target);
  const air = actor.supportingPlatformId === null;
  const tuning = stage.movement;
  let velocityX = input.horizontal * speed;
  let velocityZ = input.depth * speed;
  if (tuning) {
    const acceleration = air ? tuning.airAccelerationMmPerTick2 : tuning.groundAccelerationMmPerTick2;
    const braking = air ? tuning.airBrakingMmPerTick2 : tuning.groundBrakingMmPerTick2;
    velocityX = accelerate(actor.velocityXMmPerTick ?? 0, velocityX,
      input.horizontal === 0 ? braking : acceleration);
    velocityZ = accelerate(actor.velocityZMmPerTick ?? 0, velocityZ,
      input.depth === 0 ? braking : acceleration);
  }
  let x = clamp(actor.xMm + velocityX, stage.leftMm, stage.rightMm);
  let depth = clamp(actor.depthMm + velocityZ, stage.nearMm, stage.farMm);
  if (x === actor.xMm && velocityX * input.horizontal >= 0 && velocityX !== 0) velocityX = 0;
  if (depth === actor.depthMm && velocityZ * input.depth >= 0 && velocityZ !== 0) velocityZ = 0;
  let height = actor.heightMm;
  let velocity = actor.verticalVelocityMmPerTick;
  let platformId = actor.supportingPlatformId;
  const oldSupport = platformId ? stage.platforms.find(p => p.id === platformId) : undefined;
  if (platformId && (!oldSupport || oldSupport.topMm !== actor.heightMm)) {
    throw new Error("Invalid grounded actor support: " + actor.id);
  }
  const dropping = Boolean(platformId && oldSupport?.dropThrough && input.drop);

  let destination = support(stage, x, depth, Number.MAX_SAFE_INTEGER);
  // A wall of a higher platform is solid: curb-sized steps are allowed, dumpsters
  // and rooftops require an actual jump. No walking through raised geometry.
  if (destination && destination.topMm > height + (platformId ? stage.stepUpMm : 0)) {
    x = actor.xMm;
    depth = actor.depthMm;
    velocityX = velocityZ = 0;
    destination = support(stage, x, depth, Number.MAX_SAFE_INTEGER);
  }
  const launched = Boolean(platformId && input.jump && !dropping);
  if (launched) {
    velocity = actor.jumpSpeedMmPerTick;
    platformId = null;
  } else if (!dropping && platformId && destination &&
      destination.topMm <= height + stage.stepUpMm &&
      height - destination.topMm <= stage.stepDownMm) {
    // Small steps and sidewalk curbs are continuous traversable surfaces.
    return {
      ...actor, xMm: x, depthMm: depth, heightMm: destination.topMm,
      verticalVelocityMmPerTick: 0, supportingPlatformId: destination.id,
      ...(tuning ? { velocityXMmPerTick: velocityX, velocityZMmPerTick: velocityZ } : {}),
    };
  }

  // Leaving a ledge starts a real fall; the previous surface is no longer support.
  if (!launched) platformId = null;
  const previousHeight = height;
  velocity -= stage.gravityMmPerTick2;
  height += velocity;
  if (velocity <= 0) {
    const landing = support(stage, x, depth, previousHeight,
      dropping ? oldSupport?.id : null);
    if (landing && landing.topMm >= height) {
      height = landing.topMm;
      velocity = 0;
      platformId = landing.id;
    }
  }
  // A landing support never moves the actor below the level of an unreachable wall.
  return {
    ...actor, xMm: x, depthMm: depth, heightMm: height,
    verticalVelocityMmPerTick: velocity, supportingPlatformId: platformId,
    ...(tuning ? { velocityXMmPerTick: velocityX, velocityZMmPerTick: velocityZ } : {}),
  };
}

function distanceSquared(a: BeatActor, b: BeatActor): number {
  return (a.xMm - b.xMm) ** 2 + (a.depthMm - b.depthMm) ** 2;
}

/** Reorient only near a suitable enemy; keep a current lock until release range.
 * Locking and facing are independent of player velocity (backward walking works).
 */
function orient(
  actor: BeatActor, before: BeatActor, all: readonly BeatActor[], input: BeatInput,
  stage: BeatStage,
): BeatActor {
  if (!actor.alive) return { ...actor, targetId: null };
  const hostile = (other: BeatActor) =>
    other.alive && other.id !== actor.id && other.team !== actor.team &&
    Math.abs(other.heightMm - actor.heightMm) <= stage.targetMaxHeightMm;
  const existing = all.find(other => other.id === before.targetId);
  let target = existing && hostile(existing) &&
    distanceSquared(actor, existing) <= stage.targetReleaseMm ** 2 ? existing : null;
  if (!target) {
    const candidates = all.filter(other =>
      hostile(other) && distanceSquared(actor, other) <= stage.targetAcquireMm ** 2);
    candidates.sort((a, b) => distanceSquared(actor, a) - distanceSquared(actor, b) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    target = candidates[0] ?? null;
  }
  const deltaX = target ? target.xMm - actor.xMm : input.horizontal;
  return {
    ...actor, targetId: target?.id ?? null,
    facing: deltaX === 0 ? before.facing : deltaX > 0 ? 1 : -1,
  };
}

export function stepBeatWorld(
  prior: BeatWorldState, inputs: Readonly<Record<string, BeatInput>>, stage: BeatStage,
): BeatWorldState {
  // Intentional old-school rule: each actor advances independently. There is
  // no separation impulse, actor-to-actor solid collision, or crowd pushbox.
  const moved = prior.actors.map(actor => advance(actor, inputs[actor.id] ?? NEUTRAL_BEAT_INPUT, stage));
  // All targeting uses the same tick's positions, never iteration-dependent updates.
  const actors = moved.map((actor, index) =>
    orient(actor, prior.actors[index], moved, inputs[actor.id] ?? NEUTRAL_BEAT_INPUT, stage));
  return { tick: prior.tick + 1, actors };
}
