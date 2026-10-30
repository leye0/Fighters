import type { MoveDefinition, FighterDefinition, AttackButton, GuardLevel, MoveStance } from "../engine/simulation.ts";
import type { MotionName } from "../engine/commands.ts";

/**
 * Production combat is animation-first. These records describe motion that was
 * actually acquired, inspected frame-by-frame, retargeted and made available
 * in the approved character GLB — NOT a desired animation search term.
 */
export interface AnimationMoveReview {
  readonly id: string;
  readonly fighterId: string;
  readonly runtimeClipName: string;
  readonly source: {
    readonly provider: string;
    readonly url: string;
    readonly originalTitle: string;
    readonly sha256: string;
    readonly licenseStatus: "verified" | "pending";
    readonly gameDistribution: "approved" | "pending";
    readonly rawSourceInPublicRepo: "approved" | "excluded";
  };
  readonly review: {
    readonly status: "approved" | "pending" | "rejected";
    readonly reviewer: string;
    readonly retargeting: "passed" | "untested" | "failed";
    readonly visualPlayback: "passed" | "untested" | "failed";
    /** Frame numbering begins at zero; contactEndFrame is inclusive. */
    readonly framesPerSecond: number;
    readonly totalFrames: number;
    readonly contactStartFrame: number;
    readonly contactEndFrame: number;
  };
  /** Commands and combat properties are authored ONLY after the visual review. */
  readonly move: {
    readonly id: string;
    readonly button: AttackButton;
    readonly buttons?: readonly AttackButton[];
    readonly stance?: MoveStance;
    readonly direction?: "forward" | "back";
    readonly motion?: MotionName;
    readonly motionWindowTicks?: number;
    readonly commandPriority?: number;
    readonly damage: number;
    readonly chipDamage: number;
    readonly rangeMm: number;
    readonly maxTargetHeightMm: number;
    readonly minTargetHeightMm?: number;
    readonly maxVerticalSeparationMm?: number;
    readonly level: GuardLevel;
    readonly hitstunTicks: number;
    readonly blockstunTicks: number;
    readonly pushbackMm: number;
    /** Explicitly reviewed mobility while attacking: 0..100% of normal speed. */
    readonly groundMovementPercent?: number;
    readonly airControlPercent?: number;
    /** Upper-body-only blending requires a separate, valid locomotion clip. */
    readonly animationLayer?: "upperBody" | "fullBody";
    readonly allowJumpDuringAttack?: boolean;
    /** Explicitly reviewed transitions, not automatically invented combos. */
    readonly approvedCancels?: readonly string[];
    readonly cancelFromTick?: number;
    readonly cancelThroughTick?: number;
  };
}

export interface AnimationInventory {
  readonly schemaVersion: 1;
  readonly workflow: "animation-first";
  readonly clips: readonly AnimationMoveReview[];
}

function assertApprovedClip(clip: AnimationMoveReview): void {
  if (!clip.id || !clip.fighterId || !clip.runtimeClipName ||
      !clip.source.provider || !clip.source.originalTitle ||
      !/^https:\/\//.test(clip.source.url) ||
      !/^[a-f0-9]{64}$/i.test(clip.source.sha256) ||
      clip.source.licenseStatus !== "verified" ||
      clip.source.gameDistribution !== "approved" ||
      !["approved", "excluded"].includes(clip.source.rawSourceInPublicRepo) ||
      !clip.review.reviewer.trim() || clip.review.retargeting !== "passed" ||
      clip.review.visualPlayback !== "passed") {
    throw new Error("Unverified animation or provenance: " + clip.id);
  }
  const { framesPerSecond, totalFrames, contactStartFrame, contactEndFrame } = clip.review;
  if (![framesPerSecond, totalFrames, contactStartFrame, contactEndFrame].every(Number.isSafeInteger) ||
      framesPerSecond < 1 || framesPerSecond > 240 || totalFrames < 3 ||
      contactStartFrame < 1 || contactEndFrame < contactStartFrame ||
      contactEndFrame >= totalFrames - 1) {
    throw new Error("Invalid inspected contact frames: " + clip.id);
  }
  if (!clip.move.id || !clip.move.button) throw new Error("Unspecified command: " + clip.id);
}

function timedMove(clip: AnimationMoveReview): MoveDefinition {
  const { framesPerSecond: fps, totalFrames, contactStartFrame, contactEndFrame } = clip.review;
  // Cumulative rounding avoids drifting from the inspected clip frame boundaries.
  const ticksAt = (frames: number): number => Math.round(frames * 60 / fps);
  const startupTicks = ticksAt(contactStartFrame);
  const activeTicks = ticksAt(contactEndFrame + 1) - startupTicks;
  const recoveryTicks = ticksAt(totalFrames) - ticksAt(contactEndFrame + 1);
  if (startupTicks < 1 || activeTicks < 1 || recoveryTicks < 1) {
    throw new Error("Animation is too short for 60 Hz hit windows: " + clip.id);
  }
  const { approvedCancels, ...combat } = clip.move;
  return {
    ...combat, startupTicks, activeTicks, recoveryTicks,
    animationRole: clip.runtimeClipName,
    ...(approvedCancels ? { cancelInto: approvedCancels } : {}),
  };
}

/**
 * No catalog-first fallback: an accepted, per-character animation is the
 * prerequisite for every move. Incomplete or search-only records do nothing.
 * A missing recorded clip in the GLB is rejected separately by the renderer.
 */
export function animationBackedMoves(
  fighterId: string,
  inventory: AnimationInventory,
): readonly MoveDefinition[] {
  if (inventory.schemaVersion !== 1 || inventory.workflow !== "animation-first" ||
      !Array.isArray(inventory.clips)) {
    throw new Error("Invalid animation-first inventory");
  }
  const accepted = inventory.clips.filter(
    clip => clip.fighterId === fighterId && clip.review?.status === "approved",
  );
  const moveIds = new Set<string>();
  const clipNames = new Set<string>();
  for (const clip of accepted) {
    assertApprovedClip(clip);
    if (moveIds.has(clip.move.id) || clipNames.has(clip.runtimeClipName)) {
      throw new Error("Duplicate move or reused motion clip: " + clip.id);
    }
    moveIds.add(clip.move.id);
    clipNames.add(clip.runtimeClipName);
  }
  return accepted.map(clip => {
    const move = timedMove(clip);
    // A combo cannot target a move whose visual clip has not been approved.
    const approved = move.cancelInto?.filter(target => moveIds.has(target)) ?? [];
    if (!approved.length) {
      const { cancelInto: _links, cancelFromTick: _start, cancelThroughTick: _end, ...rest } = move;
      return rest;
    }
    return { ...move, cancelInto: approved };
  });
}

export function animationBackedFighter(
  id: string,
  inventory: AnimationInventory,
): FighterDefinition {
  return {
    id, maxHealth: 100, walkSpeedMmPerTick: 62,
    jumpSpeedMmPerTick: 165, gravityMmPerTick2: 15,
    pushboxHalfWidthMm: 285, moves: animationBackedMoves(id, inventory),
  };
}
