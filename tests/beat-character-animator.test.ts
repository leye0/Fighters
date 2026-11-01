import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClip, Bone, Group, QuaternionKeyframeTrack } from "three";
import { DIAGNOSTIC_ACTORS } from "../src/game/beat-stage.ts";
import { GAME_MOTION_NAMES, BeatCharacterAnimator, canAnimateRealGameMotions, movingRole } from
  "../src/render/beat-character-animator.ts";

function testRig(): { outer: Group; rig: Group; clips: AnimationClip[] } {
  const outer = new Group(), rig = new Group();
  outer.add(rig);
  for (let i = 0; i < 20; i++) {
    const bone = new Bone();
    bone.name = "Bone" + i;
    rig.add(bone);
  }
  const tracks = Array.from({ length: 20 }, (_, i) =>
    new QuaternionKeyframeTrack("Bone" + i + ".quaternion", [0, 0.4],
      [0, 0, 0, 1, 0, 0, 0, 1]));
  const names = new Set<string>(Object.values(GAME_MOTION_NAMES));
  let index = 0;
  while (names.size < 86) names.add("UAL1_Additional_" + index++);
  const clips = [...names].map(name => new AnimationClip(name, 0.4, tracks));
  return { outer, rig, clips };
}

test("the gameplay gate requires all 86 own-skin authored motions", () => {
  const { clips } = testRig();
  assert.equal(canAnimateRealGameMotions(clips), true);
  assert.equal(canAnimateRealGameMotions(clips.slice(1)), false);
  assert.equal(canAnimateRealGameMotions([...clips, clips[0]]), false);
  assert.equal(canAnimateRealGameMotions(clips.map((c, i) =>
    i === 0 ? new AnimationClip(c.name, 0, c.tracks) : c)), false);
});

test("world-driven locomotion does not invent target-driven backpedaling", () => {
  const actor = DIAGNOSTIC_ACTORS[0];
  assert.equal(movingRole(actor, actor), "idle");
  assert.equal(movingRole(actor, { ...actor, xMm: actor.xMm + 50 }), "walk");
  assert.equal(movingRole(actor, { ...actor, xMm: actor.xMm - 50 }), "walk");
  assert.equal(movingRole(actor, { ...actor, depthMm: actor.depthMm - 50 }), "walk");
  assert.equal(movingRole(actor, { ...actor, supportingPlatformId: null,
    verticalVelocityMmPerTick: 20 }), "jump");
  assert.equal(movingRole(actor, { ...actor, supportingPlatformId: null,
    verticalVelocityMmPerTick: -20 }), "fall");
});

test("hero direction is immediate and cannot be stolen by a visual turn or jump", () => {
  const { outer, rig, clips } = testRig();
  const controller = new BeatCharacterAnimator(outer, rig, clips, 1, true);
  const actor = DIAGNOSTIC_ACTORS[0];
  const airborne = { ...actor, supportingPlatformId: null,
    heightMm: 300, verticalVelocityMmPerTick: 120, facing: -1 as const };
  controller.update(actor, airborne, 1 / 60);
  assert.equal(outer.rotation.y, -Math.PI / 2);
  controller.update(airborne, { ...airborne, facing: 1 }, 1 / 60);
  assert.equal(outer.rotation.y, Math.PI / 2);
  assert.deepEqual(controller.availableCombatClips(),
    [GAME_MOTION_NAMES.punchJab, GAME_MOTION_NAMES.punchCross, GAME_MOTION_NAMES.hook]);
  assert.equal(controller.playCombatAttack(0), true);
  assert.equal(controller.playCombatAttack(1), false);
  controller.dispose();
});
