import { AnimationAction, AnimationClip, AnimationMixer, Group, LoopOnce } from "three";
import type { BeatActor, Facing } from "../engine/beat-em-up-world.ts";

export const GAME_MOTION_NAMES = {
  idle: "Fighters_Mixamo_Fighting_Idle",
  walk: "Fighters_Mixamo_Walk_Standard",
  walkFeminine: "Fighters_Mixamo_Walk_Feminine",
  walkBackward: "Fighters_Mixamo_Walk_Backward",
  turn: "Fighters_Mixamo_Left_Turn_180",
  jump: "Fighters_Mixamo_Jump",
  fall: "Fighters_Mixamo_Fall",
} as const;

/** Real YBot translation integrated over each source cycle (metres/second).
 * Source hip translation is deliberately removed from the rig clips because
 * the kinematic 60 Hz simulation owns travel. TimeScale preserves foot tempo.
 */
const SOURCE_WALK_METERS_PER_SECOND: Readonly<Record<string, number>> = {
  [GAME_MOTION_NAMES.walk]: 1.043,
  [GAME_MOTION_NAMES.walkFeminine]: 1.607,
  [GAME_MOTION_NAMES.walkBackward]: 1.337,
};

export function canAnimateRealGameMotions(clips: readonly AnimationClip[]): boolean {
  const names = new Set(clips.map(clip => clip.name));
  return Object.values(GAME_MOTION_NAMES).every(name => names.has(name));
}

export type MovingRole = "idle" | "walk" | "walkBackward" | "jump" | "fall";
/** The simulation supplies root travel; animation clips contribute joints only. */
export function movingRole(previous: BeatActor, actor: BeatActor): MovingRole {
  if (actor.supportingPlatformId === null) {
    return actor.verticalVelocityMmPerTick > 0 ? "jump" : "fall";
  }
  const horizontal = actor.xMm - previous.xMm;
  const depth = actor.depthMm - previous.depthMm;
  if (!horizontal && !depth) return "idle";
  if (horizontal && Math.sign(horizontal) !== actor.facing) return "walkBackward";
  return "walk";
}

/** Real Mixamo clips baked onto the actual skeleton.
 * The author-supplied 180-degree turn must never lock player steering. A
 * short, interruptible visual turn completes while movement obeys input.
 */
export class BeatCharacterAnimator {
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly outer: Group;
  private readonly isHero: boolean;
  private readonly gravityMmPerTick2: number;
  private activeName: string | null = null;
  private visualFacing: Facing;
  private turningTo: Facing | null = null;
  private turnElapsed = 0;
  private readonly turnDuration: number;

  constructor(outer: Group, animatedRig: Group,
    clips: readonly AnimationClip[], facing: Facing, isHero: boolean,
    gravityMmPerTick2 = 19) {
    this.outer = outer;
    this.isHero = isHero;
    this.gravityMmPerTick2 = gravityMmPerTick2;
    if (!canAnimateRealGameMotions(clips)) throw new Error("Missing baked Mixamo gameplay animations");
    this.mixer = new AnimationMixer(animatedRig);
    for (const clip of clips) {
      if (Object.values(GAME_MOTION_NAMES).includes(clip.name as typeof GAME_MOTION_NAMES[keyof typeof GAME_MOTION_NAMES])) {
        this.actions.set(clip.name, this.mixer.clipAction(clip));
      }
    }
    this.visualFacing = facing;
    // 1.63s is much too long for directional controls on a mobile arcade pad.
    // Keep the actual Mixamo performance, but play its turn in at most 0.26s.
    this.turnDuration = Math.min(0.26, this.actions.get(GAME_MOTION_NAMES.turn)!.getClip().duration);
    this.outer.rotation.y = this.yaw;
    this.playBase(GAME_MOTION_NAMES.idle, true);
  }

  private get yaw(): number { return this.visualFacing === 1 ? Math.PI / 2 : -Math.PI / 2; }

  private playBase(name: string, immediate = false): void {
    if (this.activeName === name) return;
    const old = this.activeName ? this.actions.get(this.activeName) : undefined;
    const next = this.actions.get(name);
    if (!next) throw new Error("Missing actual Mixamo animation: " + name);
    if (immediate) {
      this.mixer.stopAllAction();
      next.reset().play();
      next.setEffectiveWeight(1);
      this.mixer.update(0);
    } else {
      old?.fadeOut(0.14);
      next.reset().fadeIn(0.14).play();
    }
    if (name === GAME_MOTION_NAMES.jump) {
      next.setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    this.activeName = name;
  }

  update(before: BeatActor, actor: BeatActor, seconds: number): void {
    const dt = Math.max(0, Math.min(0.05, seconds));
    // If the player changes their mind mid-turn, stop the old visual turn
    // immediately. Never finish an obsolete 180° animation against input.
    if (this.turningTo !== null && actor.facing === this.visualFacing) {
      this.mixer.stopAllAction();
      this.turningTo = null;
      this.activeName = null;
    }
    if (this.turningTo === null && actor.facing !== this.visualFacing) {
      this.turningTo = actor.facing;
      this.turnElapsed = 0;
      this.mixer.stopAllAction();
      const action = this.actions.get(GAME_MOTION_NAMES.turn)!;
      action.reset().setLoop(LoopOnce, 1).play();
      action.setEffectiveTimeScale(action.getClip().duration / this.turnDuration);
      action.clampWhenFinished = true;
      this.activeName = GAME_MOTION_NAMES.turn;
    }
    if (this.turningTo !== null) {
      this.mixer.update(dt);
      this.turnElapsed += dt;
      if (this.turnElapsed >= this.turnDuration) {
        this.visualFacing = this.turningTo;
        this.turningTo = null;
        this.outer.rotation.y = this.yaw;
        this.activeName = null;
        // Don't blend a 180° hip turn *backwards* against the new world yaw.
        this.playBase(GAME_MOTION_NAMES.idle, true);
      }
      return;
    }
    const role = movingRole(before, actor);
    const name = role === "idle" ? GAME_MOTION_NAMES.idle
      : role === "walkBackward" ? GAME_MOTION_NAMES.walkBackward
        : role === "jump" ? GAME_MOTION_NAMES.jump
          : role === "fall" ? GAME_MOTION_NAMES.fall
            : this.isHero ? GAME_MOTION_NAMES.walkFeminine : GAME_MOTION_NAMES.walk;
    this.playBase(name);
    const sourceMetersPerSecond = SOURCE_WALK_METERS_PER_SECOND[name];
    if (sourceMetersPerSecond) {
      // Use actual displacement, not maximum speed: feet must follow the
      // acceleration/braking arc rather than sprinting over slow travel.
      const gameMetersPerSecond = Math.hypot(actor.xMm - before.xMm,
        actor.depthMm - before.depthMm) * 60 / 1000;
      this.actions.get(name)!.setEffectiveTimeScale(gameMetersPerSecond / sourceMetersPerSecond);
    }
    if (name === GAME_MOTION_NAMES.jump) {
      // The authored jump begins on takeoff; a separate real Mixamo fall
      // takes over after the apex. Root height is entirely deterministic.
      const flightSeconds = 2 * actor.jumpSpeedMmPerTick / this.gravityMmPerTick2 / 60;
      this.actions.get(name)!.setEffectiveTimeScale(
        this.actions.get(name)!.getClip().duration / flightSeconds);
    }
    this.mixer.update(dt);
  }

  dispose(): void { this.mixer.stopAllAction(); }
}
