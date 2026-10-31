import { AnimationAction, AnimationClip, AnimationMixer, Group, LoopOnce, LoopRepeat } from "three";
import type { BeatActor, Facing } from "../engine/beat-em-up-world.ts";

/** All clips come from the two free Quaternius Universal Animation Libraries. */
export const GAME_MOTION_NAMES = {
  idle: "UAL1_Idle_Loop",
  walk: "UAL1_Walk_Loop",
  walkFormal: "UAL1_Walk_Formal_Loop",
  jog: "UAL1_Jog_Fwd_Loop",
  sprint: "UAL1_Sprint_Loop",
  jumpStart: "UAL1_Jump_Start",
  jumpLoop: "UAL1_Jump_Loop",
  jumpLand: "UAL1_Jump_Land",
  crouch: "UAL1_Crouch_Idle_Loop",
  punchJab: "UAL1_Punch_Jab",
  punchCross: "UAL1_Punch_Cross",
  hook: "UAL2_Melee_Hook",
  knockback: "UAL2_Hit_Knockback",
  death: "UAL1_Death01",
} as const;

export type MovingRole = "idle" | "walk" | "jump" | "fall";
export function movingRole(previous: BeatActor, actor: BeatActor): MovingRole {
  if (actor.supportingPlatformId === null)
    return actor.verticalVelocityMmPerTick > 0 ? "jump" : "fall";
  if (actor.xMm === previous.xMm && actor.depthMm === previous.depthMm) return "idle";
  return "walk";
}

/** A partial pack cannot animate a production character. */
export function canAnimateRealGameMotions(clips: readonly AnimationClip[]): boolean {
  const names = new Set(clips.map(clip => clip.name));
  return clips.length === 86 && names.size === 86 &&
    Object.values(GAME_MOTION_NAMES).every(name => names.has(name)) &&
    clips.every(clip => clip.tracks.length >= 20 && clip.duration > 0);
}

/**
 * Visual playback only. Simulation controls X/Z/Y, facing and collisions.
 * Every action is a Quaternius authored clip baked onto THIS character skin.
 * No runtime rebind, anatomy correction, source offsets or body warping.
 */
export class BeatCharacterAnimator {
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly outer: Group;
  private active: string | null = null;
  private landedAt = -Infinity;
  private elapsed = 0;
  private airborneFromJump = false;
  private attackEndsAt = -Infinity;

  constructor(outer: Group, animatedRig: Group, clips: readonly AnimationClip[], facing: Facing,
    _isHero: boolean, _gravityMmPerTick2 = 5) {
    if (!canAnimateRealGameMotions(clips))
      throw new Error("Expected 86 Quaternius CC0 clips on the actual rig");
    this.outer = outer;
    this.mixer = new AnimationMixer(animatedRig);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.outer.rotation.y = this.yaw(facing);
    this.play(GAME_MOTION_NAMES.idle, true);
  }

  private yaw(facing: Facing): number { return facing === 1 ? Math.PI / 2 : -Math.PI / 2; }

  private play(name: string, immediate = false): void {
    if (this.active === name) return;
    const old = this.active && this.actions.get(this.active);
    const next = this.actions.get(name);
    if (!next) throw new Error("Missing Quaternius animation: " + name);
    if (immediate) this.mixer.stopAllAction();
    else if (old) old.fadeOut(0.12);
    next.reset();
    const oneShots: readonly string[] = [
      GAME_MOTION_NAMES.jumpStart, GAME_MOTION_NAMES.jumpLand,
      GAME_MOTION_NAMES.punchJab, GAME_MOTION_NAMES.punchCross,
      GAME_MOTION_NAMES.hook, GAME_MOTION_NAMES.knockback, GAME_MOTION_NAMES.death,
    ];
    const oneShot = oneShots.includes(name);
    next.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity);
    next.clampWhenFinished = oneShot;
    if (!immediate) next.fadeIn(0.12);
    next.play();
    this.active = name;
    if (immediate) this.mixer.update(0);
  }

  update(before: BeatActor, actor: BeatActor, seconds: number): void {
    const dt = Math.max(0, Math.min(0.05, seconds));
    this.elapsed += dt;
    // Always honor actual left/right input; enemies never impose an orientation.
    this.outer.rotation.y = this.yaw(actor.facing);
    const tookOff = before.supportingPlatformId !== null && actor.supportingPlatformId === null;
    const landed = before.supportingPlatformId === null && actor.supportingPlatformId !== null;
    if (tookOff) {
      this.attackEndsAt = -Infinity;
      this.airborneFromJump = actor.verticalVelocityMmPerTick > 0;
      if (this.airborneFromJump) this.play(GAME_MOTION_NAMES.jumpStart);
    }
    if (landed) {
      this.airborneFromJump = false;
      this.landedAt = this.elapsed;
      this.play(GAME_MOTION_NAMES.jumpLand);
    }
    if (actor.supportingPlatformId !== null && this.elapsed < this.attackEndsAt) {
      this.mixer.update(dt);
      return;
    }
    if (actor.supportingPlatformId === null) {
      const start = this.actions.get(GAME_MOTION_NAMES.jumpStart)!;
      if (!this.airborneFromJump || this.active !== GAME_MOTION_NAMES.jumpStart ||
          start.time >= start.getClip().duration - 0.02)
        this.play(GAME_MOTION_NAMES.jumpLoop);
    } else if (!landed) {
      const landDuration = this.actions.get(GAME_MOTION_NAMES.jumpLand)!.getClip().duration;
      if (this.elapsed - this.landedAt >= landDuration) {
        this.play(movingRole(before, actor) === "idle" ? GAME_MOTION_NAMES.idle : GAME_MOTION_NAMES.walk);
      }
    }
    this.mixer.update(dt);
  }

  /** Authored attack takes; damage is determined independently by gameplay data. */
  availableCombatClips(): readonly string[] {
    return [GAME_MOTION_NAMES.punchJab, GAME_MOTION_NAMES.punchCross, GAME_MOTION_NAMES.hook];
  }

  /** Plays a genuine authored combat gesture; no unreviewed hitboxes/damage are inferred. */
  previewCombatGesture(index: number): boolean {
    const name = this.availableCombatClips()[index];
    if (!name || this.elapsed < this.attackEndsAt) return false;
    const clip = this.actions.get(name)?.getClip();
    if (!clip) return false;
    this.play(name);
    this.attackEndsAt = this.elapsed + clip.duration;
    return true;
  }

  dispose(): void { this.mixer.stopAllAction(); }
}
