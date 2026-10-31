import { AnimationAction, AnimationClip, AnimationMixer, Bone, Group, LoopOnce,
  Quaternion, QuaternionKeyframeTrack } from "three";
import type { BeatActor, Facing } from "../engine/beat-em-up-world.ts";
import { HumanoidArmClearance } from "./humanoid-arm-clearance.ts";

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

/**
 * The acquired Mixamo "Jumping In Place" includes a DOUBLE knee tuck (about
 * 138 degrees on Claudia) around 40–55% of its 2.167s authored performance.
 * The arcade world already supplies the vertical jump; this is not a jump
 * attack or a somersault. Re-time ORIGINAL MIXAMO joint poses so the feet
 * extend through flight, preserving launch and landing poses with a smooth
 * quaternion transition instead of replaying the implausible tucked section.
 *
 * Values refer to the specific, verified Jump.fbx motion, not all jumps.
 * Source poses remain authentic Mixamo frames, including during the blend.
 * No authored hip/world translation is added to the kinematic game position.
 */
export function jumpSourcePoseWindow(phase: number):
  Readonly<{ a: number; b: number; blend: number }> {
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) {
    throw new Error("Jump phase must be between 0 and 1");
  }
  if (phase <= 0.11) {
    return { a: phase * (0.10 / 0.11), b: 0, blend: 0 };
  }
  if (phase <= 0.26) {
    return { a: 0.10, b: 0.76, blend: (phase - 0.11) / 0.15 };
  }
  if (phase <= 0.84) {
    return { a: 0.76 + (phase - 0.26) * (0.13 / 0.58), b: 0, blend: 0 };
  }
  return { a: 0.89 + (phase - 0.84) * (0.11 / 0.16), b: 0, blend: 0 };
}

/** Sample a real GLB quaternion keyframe track with normalized slerp.
 * The imported gameplay clips use LINEAR glTF quaternion interpolation.
 * Avoid relying on private Three.js interpolant methods or type definitions.
 */
export function sampleMixamoQuaternion(track: QuaternionKeyframeTrack, time: number): Quaternion {
  const times = track.times;
  if (!times.length || !Number.isFinite(time)) {
    throw new Error("Invalid Mixamo quaternion track sample time");
  }
  const frame = (index: number) =>
    new Quaternion().fromArray(track.values, index * 4).normalize();
  if (time <= times[0]) return frame(0);
  const last = times.length - 1;
  if (time >= times[last]) return frame(last);
  let low = 0, high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (times[mid] <= time) low = mid;
    else high = mid;
  }
  const duration = times[high] - times[low];
  if (duration <= 0) throw new Error("Invalid Mixamo quaternion track timeline");
  return frame(low).slerp(frame(high), (time - times[low]) / duration).normalize();
}

/** Build once per rig; all output tracks are quaternion samples from genuine
 * Mixamo keyframes or slerp between two such samples.
 */
export function makeArcadeJumpClip(source: AnimationClip): AnimationClip {
  if (source.name !== GAME_MOTION_NAMES.jump || source.duration < 0.2) {
    throw new Error("Expected the genuine baked Mixamo Jump clip");
  }
  const frames = Math.ceil(source.duration * 30) + 1;
  const timeline = Array.from({ length: frames },
    (_, index) => index * source.duration / (frames - 1));
  const tracks = source.tracks.map(track => {
    if (!(track instanceof QuaternionKeyframeTrack)) {
      throw new Error("Unexpected non-quaternion bone track in Mixamo jump");
    }
    const poseAt = (fraction: number) =>
      sampleMixamoQuaternion(track, source.duration * fraction);
    const values: number[] = [];
    for (const time of timeline) {
      const { a, b, blend } = jumpSourcePoseWindow(time / source.duration);
      const pose = poseAt(a);
      if (blend > 0) pose.slerp(poseAt(b), Math.min(1, blend)).normalize();
      values.push(...pose.toArray());
    }
    return new QuaternionKeyframeTrack(track.name, timeline, values);
  });
  return new AnimationClip(source.name, source.duration, tracks);
}

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
  // Facing follows the explicit left/right command, not auto-targeting.
  // The small inertial velocity from a direction reversal must not trigger
  // the old face-the-enemy backpedal gait.
  return "walk";
}

/** Real Mixamo clips baked onto the actual skeleton.
 * The author-supplied 180-degree turn must never lock player steering. A
 * short, interruptible visual turn completes while movement obeys input.
 */
export class BeatCharacterAnimator {
  private readonly mixer: AnimationMixer;
  private readonly armClearance?: HumanoidArmClearance;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly outer: Group;
  private readonly isHero: boolean;
  private readonly gravityMmPerTick2: number;
  private activeName: string | null = null;
  private authoredJumpInFlight = false;
  private visualFacing: Facing;
  private turningTo: Facing | null = null;
  private turnElapsed = 0;
  private readonly turnDuration: number;

  constructor(outer: Group, animatedRig: Group,
    clips: readonly AnimationClip[], facing: Facing, isHero: boolean,
    gravityMmPerTick2 = 19, nativeSameRigSource = false) {
    this.outer = outer;
    this.isHero = isHero;
    this.gravityMmPerTick2 = gravityMmPerTick2;
    // Real same-rig Mixamo exports are already anatomically authored.
    // Constrain only the existing cross-rig YBot assets until they are
    // replaced, and do not alter any unskinned test-only proxy.
    let hasBones = false;
    animatedRig.traverse(child => { if (child instanceof Bone) hasBones = true; });
    if (!nativeSameRigSource && hasBones) {
      this.armClearance = new HumanoidArmClearance(animatedRig);
      this.armClearance.captureReferencePose();
    }
    if (!canAnimateRealGameMotions(clips)) throw new Error("Missing baked Mixamo gameplay animations");
    this.mixer = new AnimationMixer(animatedRig);
    for (const clip of clips) {
      if (Object.values(GAME_MOTION_NAMES).includes(clip.name as typeof GAME_MOTION_NAMES[keyof typeof GAME_MOTION_NAMES])) {
        // The old YBot-baked source needs the documented tuck-removal
        // workaround. Real character-specific Mixamo FBXs must instead be
        // played as authored, without pretending their timing is identical
        // to the previously measured YBot clip.
        const playable = clip.name === GAME_MOTION_NAMES.jump && !nativeSameRigSource
          ? makeArcadeJumpClip(clip) : clip;
        this.actions.set(clip.name, this.mixer.clipAction(playable));
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
      this.armClearance?.apply();
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
    // A mid-air 180° standing-turn clip can replace the jump pose and
    // fold knees for no gameplay reason. Honor manual facing in flight,
    // but reserve the authored standing turn for actors on solid ground.
    if (actor.supportingPlatformId === null && (
        this.turningTo !== null || actor.facing !== this.visualFacing)) {
      this.mixer.stopAllAction();
      this.activeName = null;
      this.turningTo = null;
      this.visualFacing = actor.facing;
      this.outer.rotation.y = this.yaw;
    }
    // If the player changes their mind mid-turn, stop the old visual turn
    // immediately. Never finish an obsolete 180° animation against input.
    if (this.turningTo !== null && actor.facing === this.visualFacing) {
      this.mixer.stopAllAction();
      this.turningTo = null;
      this.activeName = null;
    }
    if (actor.supportingPlatformId !== null &&
        this.turningTo === null && actor.facing !== this.visualFacing) {
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
      this.armClearance?.apply();
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
    // A jump is one authored motion across the ENTIRE ballistic flight,
    // including descending frames; the separate genuine Fall clip is used
    // only when walking off a ledge or dropping through a platform.
    if (actor.supportingPlatformId !== null) this.authoredJumpInFlight = false;
    else if (before.supportingPlatformId !== null &&
             actor.verticalVelocityMmPerTick > 0) this.authoredJumpInFlight = true;
    const role = movingRole(before, actor);
    const name = actor.supportingPlatformId === null
      ? (this.authoredJumpInFlight ? GAME_MOTION_NAMES.jump : GAME_MOTION_NAMES.fall)
      : role === "idle" ? GAME_MOTION_NAMES.idle : GAME_MOTION_NAMES.walk;
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
      // Let the authored Mixamo jump cover ascent, apex and descent.
      // Ledge falls use the separate Mixamo fall clip; only the deterministic
      // world controls root elevation.
      const flightSeconds = 2 * actor.jumpSpeedMmPerTick / this.gravityMmPerTick2 / 60;
      this.actions.get(name)!.setEffectiveTimeScale(
        this.actions.get(name)!.getClip().duration / flightSeconds);
    }
    this.mixer.update(dt);
    this.armClearance?.apply();
  }

  dispose(): void { this.mixer.stopAllAction(); }
}
