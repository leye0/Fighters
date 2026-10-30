import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClip, Group } from "three";
import { DIAGNOSTIC_ACTORS, DIAGNOSTIC_STAGE } from "../src/game/beat-stage.ts";
import { GAME_MOTION_NAMES, BeatCharacterAnimator, canAnimateRealGameMotions, movingRole } from
  "../src/render/beat-character-animator.ts";

test("real animation gate requires all seven actual baked Mixamo motions", () => {
  const clips = Object.values(GAME_MOTION_NAMES).map(name => new AnimationClip(name, 1, []));
  assert.equal(canAnimateRealGameMotions(clips), true);
  assert.equal(canAnimateRealGameMotions(clips.slice(1)), false);
});

test("movement-driven Mixamo choices distinguish forward and backward without pushboxes", () => {
  const actor = DIAGNOSTIC_ACTORS[0];
  assert.equal(movingRole(actor, actor), "idle");
  assert.equal(movingRole(actor, { ...actor, xMm: actor.xMm + 50 }), "walk");
  assert.equal(movingRole(actor, { ...actor, xMm: actor.xMm - 50 }), "walk",
    "a manual turn must not play the obsolete retreat-while-facing-enemy gait");
  assert.equal(movingRole(actor, { ...actor, depthMm: actor.depthMm + 40 }), "walk");
  assert.equal(movingRole(actor, { ...actor, heightMm: 300, verticalVelocityMmPerTick: 150,
    supportingPlatformId: null }), "jump");
  assert.equal(movingRole(actor, { ...actor, heightMm: 300, verticalVelocityMmPerTick: -150,
    supportingPlatformId: null }), "fall");
});

test("Mixamo turn is quick, interruptible, and cannot override player-selected direction", () => {
  const actor = DIAGNOSTIC_ACTORS[0];
  const root = new Group(), rig = new Group();
  root.add(rig);
  const clips = Object.values(GAME_MOTION_NAMES).map(name => new AnimationClip(name, name === GAME_MOTION_NAMES.turn ? 1.633 : 1, []));
  const animator = new BeatCharacterAnimator(root, rig, clips, 1, true);
  const left = { ...actor, xMm: actor.xMm - 15, facing: -1 as const };
  animator.update(actor, left, 0.05);
  // Cancellation must work even while the authored clip is still playing.
  const right = { ...actor, xMm: actor.xMm + 15, facing: 1 as const };
  animator.update(left, right, 0.05);
  assert.ok(Math.abs(root.rotation.y - Math.PI / 2) < 1e-5,
    "reversing input during turn must immediately cancel obsolete direction");
  for (let i = 0; i < 8; i++) animator.update(right, left, 0.05);
  assert.ok(Math.abs(root.rotation.y + Math.PI / 2) < 1e-5,
    "a genuine Mixamo turn must complete in less than 0.4 second");
  animator.dispose();
});

test("diagnostic jump is a smooth arcade arc rather than the old 0.54s impulse", () => {
  const speed = DIAGNOSTIC_ACTORS[0].jumpSpeedMmPerTick;
  const gravity = DIAGNOSTIC_STAGE.gravityMmPerTick2;
  const flightSeconds = 2 * speed / gravity / 60;
  assert.ok(flightSeconds > 1.0 && flightSeconds < 1.2,
    "arcade jump must last long enough for a readable authored animation");
});

test("movement reversal keeps authored walk even with residual opposite inertia", () => {
  const actor = DIAGNOSTIC_ACTORS[0];
  assert.equal(movingRole(actor, { ...actor, xMm: actor.xMm + 15, facing: -1 }), "walk");
  assert.equal(movingRole(actor, { ...actor, xMm: actor.xMm - 15, facing: 1 }), "walk");
});
