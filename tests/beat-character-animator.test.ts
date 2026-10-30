import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClip } from "three";
import { DIAGNOSTIC_ACTORS } from "../src/game/beat-stage.ts";
import { GAME_MOTION_NAMES, canAnimateRealGameMotions, movingRole } from
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
  assert.equal(movingRole(actor, { ...actor, xMm: actor.xMm - 50 }), "walkBackward");
  assert.equal(movingRole(actor, { ...actor, depthMm: actor.depthMm + 40 }), "walk");
  assert.equal(movingRole(actor, { ...actor, heightMm: 300, verticalVelocityMmPerTick: 150,
    supportingPlatformId: null }), "jump");
  assert.equal(movingRole(actor, { ...actor, heightMm: 300, verticalVelocityMmPerTick: -150,
    supportingPlatformId: null }), "fall");
});
