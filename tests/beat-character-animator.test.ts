import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClip, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from "three";
import { DIAGNOSTIC_ACTORS, DIAGNOSTIC_STAGE } from "../src/game/beat-stage.ts";
import { GAME_MOTION_NAMES, BeatCharacterAnimator, canAnimateRealGameMotions, jumpSourcePoseWindow,
  makeArcadeJumpClip, movingRole } from
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

test("verified Jump.fbx knee-tuck frames are NOT played during an arcade flight", () => {
  assert.deepEqual(jumpSourcePoseWindow(0), { a: 0, b: 0, blend: 0 });
  assert.deepEqual(jumpSourcePoseWindow(0.11), { a: 0.10, b: 0, blend: 0 });
  const transition = jumpSourcePoseWindow(0.20);
  assert.equal(transition.a, 0.10);
  assert.equal(transition.b, 0.76);
  assert.ok(transition.blend > 0 && transition.blend < 1);
  const transitionEnd = jumpSourcePoseWindow(0.26);
  assert.equal(transitionEnd.a, 0.10);
  assert.equal(transitionEnd.b, 0.76);
  assert.ok(Math.abs(transitionEnd.blend - 1) < 1e-9);
  for (const phase of [0.27, 0.40, 0.50, 0.75, 0.84, 0.90, 1]) {
    const frame = jumpSourcePoseWindow(phase);
    assert.ok(frame.a >= 0.75 && frame.a <= 1,
      "middle of flight must avoid the 0.4–0.55 tucked-knee interval");
    assert.equal(frame.blend, 0);
  }
  assert.throws(() => jumpSourcePoseWindow(-0.01));
  assert.throws(() => jumpSourcePoseWindow(1.01));
});

test("arcade airborne jump samples ONLY authored Mixamo quaternions and blends continuously", () => {
  const duration = 2.1666667;
  const sourceTimes = [0, 0.10, 0.25, 0.5, 0.76, 0.89, 1];
  const sourceAngles = [15, 20, 85, 138, 40, 20, 15];
  const axis = new Vector3(0, 0, 1);
  const frames = sourceAngles.map(deg =>
    new Quaternion().setFromAxisAngle(axis, deg * Math.PI / 180).toArray());
  const source = new AnimationClip(GAME_MOTION_NAMES.jump, duration, [
    new QuaternionKeyframeTrack(".bones[LeftLeg].quaternion",
      sourceTimes.map(t => t * duration), frames.flat()),
  ]);
  const output = makeArcadeJumpClip(source);
  assert.equal(output.name, GAME_MOTION_NAMES.jump);
  assert.equal(output.duration, source.duration);
  assert.ok(output.tracks[0] instanceof QuaternionKeyframeTrack);
  const track = output.tracks[0];
  const interpolant = track.createInterpolant();
  const angles = Array.from({length:51},(_,i)=>{
    const q = new Quaternion().fromArray(interpolant.evaluate(duration * i / 50));
    assert.ok(Math.abs(q.length() - 1) < 0.001);
    return q.angleTo(new Quaternion()) * 180 / Math.PI;
  });
  assert.ok(Math.max(...angles) < 55,
    "the retimed source must not recreate the 138° tucked-knee airborne pose");
  for(let i=1;i<angles.length;i++){
    assert.ok(Math.abs(angles[i]-angles[i-1]) < 12,
      "blend between authentic takeoff and flight poses must be continuous");
  }
  assert.ok(source.tracks[0].times.length === sourceTimes.length,
    "source GLB animation remains intact");
});

test("airborne facing changes never play a standing 180-degree turn over the jump", () => {
  const before = DIAGNOSTIC_ACTORS[0];
  const outer = new Group(), rig = new Group();
  outer.add(rig);
  const animations = Object.values(GAME_MOTION_NAMES).map(name =>
    new AnimationClip(name, name === GAME_MOTION_NAMES.turn ? 1.633 : 1,
      name === GAME_MOTION_NAMES.jump
        ? [new QuaternionKeyframeTrack(".bones[Head].quaternion", [0,1],
            [0,0,0,1,0,0,0,1])] : []));
  const controller = new BeatCharacterAnimator(outer, rig, animations, 1, true);
  const airborne = { ...before, supportingPlatformId: null,
    heightMm: 300, verticalVelocityMmPerTick: 120, facing: -1 as const };
  controller.update(before, airborne, 1/60);
  assert.equal(outer.rotation.y, -Math.PI/2,
    "air control should rotate the visual root immediately, without a ground-turn clip");
  controller.dispose();
});
