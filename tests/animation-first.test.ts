import test from "node:test";
import assert from "node:assert/strict";
import { animationBackedMoves, animationBackedFighter, type AnimationInventory, type AnimationMoveReview } from "../src/game/animation-first.ts";
import { createMatch, stepMatch, NEUTRAL_INPUT } from "../src/engine/simulation.ts";

const sample: AnimationMoveReview = {
  id: "clip-001",
  fighterId: "f1",
  runtimeClipName: "Real Punch 01",
  source: {
    provider: "Test animation source", url: "https://example.test/real-punch",
    originalTitle: "Actual Punch", sha256: "a".repeat(64),
    licenseStatus: "verified", gameDistribution: "approved",
    rawSourceInPublicRepo: "excluded",
  },
  review: {
    status: "approved", reviewer: "visual-qa",
    retargeting: "passed", visualPlayback: "passed",
    framesPerSecond: 30, totalFrames: 30,
    contactStartFrame: 6, contactEndFrame: 8,
  },
  move: {
    id: "real-punch", button: "LP", damage: 8, chipDamage: 0,
    rangeMm: 1000, maxTargetHeightMm: 1600, level: "mid",
    hitstunTicks: 12, blockstunTicks: 8, pushbackMm: 100,
    approvedCancels: ["real-kick", "missing-animation"],
    cancelFromTick: 12, cancelThroughTick: 17,
  },
};
const inventory = (clips: AnimationMoveReview[]): AnimationInventory => ({
  schemaVersion: 1, workflow: "animation-first", clips,
});
const kick: AnimationMoveReview = {
  ...sample, id: "clip-002", runtimeClipName: "Real Kick 02",
  move: { ...sample.move, id: "real-kick", button: "HK",
    approvedCancels: undefined, cancelFromTick: undefined, cancelThroughTick: undefined },
};

test("no acquired, approved and retargeted animations means no production attacks", () => {
  assert.deepEqual(animationBackedMoves("f1", inventory([])), []);
  assert.deepEqual(animationBackedFighter("f1", inventory([])).moves, []);
  assert.deepEqual(animationBackedMoves("f2", inventory([sample])), []);
  const pending = { ...sample, review: { ...sample.review, status: "pending" as const } };
  assert.deepEqual(animationBackedMoves("f1", inventory([pending])), []);
});

test("actual inspected contact frames determine startup/active/recovery at 60 Hz", () => {
  const [move] = animationBackedMoves("f1", inventory([sample]));
  assert.deepEqual([move.startupTicks,move.activeTicks,move.recoveryTicks],[12,6,42]);
  assert.equal(move.animationRole,"Real Punch 01");
  assert.equal(move.button,"LP");
  assert.equal(move.damage,8);
});

test("combos only permit follow-ups whose distinct clips are approved", () => {
  const [alone] = animationBackedMoves("f1", inventory([sample]));
  assert.deepEqual(alone.cancelInto,undefined);
  assert.equal(alone.cancelFromTick,undefined);
  const [withKick] = animationBackedMoves("f1", inventory([sample,kick]));
  assert.deepEqual(withKick.cancelInto,["real-kick"]);
});

test("missing provenance, license, retargeting, or visual playback is rejected", () => {
  const failures: AnimationMoveReview[] = [
    {...sample, source:{...sample.source,sha256:"not-a-hash"}},
    {...sample, source:{...sample.source,licenseStatus:"pending"}},
    {...sample, source:{...sample.source,gameDistribution:"pending"}},
    {...sample, review:{...sample.review,visualPlayback:"untested"}},
    {...sample, review:{...sample.review,retargeting:"failed"}},
    {...sample, review:{...sample.review,reviewer:" "}},
  ];
  for(const invalid of failures){
    assert.throws(()=>animationBackedMoves("f1",inventory([invalid])),/Unverified animation/);
  }
});

test("duplicated moves or reuse of one animation to inflate moves is rejected", () => {
  assert.throws(()=>animationBackedMoves("f1",inventory([sample,sample])),/Duplicate/);
  assert.throws(()=>animationBackedMoves("f1",inventory([
    sample, {...kick,runtimeClipName:sample.runtimeClipName}
  ])),/Duplicate/);
});

test("invalid inspected frames cannot become arbitrary hit windows", () => {
  const invalid = {...sample,review:{...sample.review,contactEndFrame:29}};
  assert.throws(()=>animationBackedMoves("f1",inventory([invalid])),/Invalid inspected contact frames/);
  const fractional = {...sample,review:{...sample.review,framesPerSecond:29.97}};
  assert.throws(()=>animationBackedMoves("f1",inventory([fractional])),/Invalid inspected contact frames/);
});

test("the real approved clip-derived move works with deterministic simulation", () => {
  const clips = inventory([sample,kick,
    {...sample,id:"clip-003",fighterId:"f2",runtimeClipName:"Other Punch"}
  ]);
  const match = {
    stage: {leftMm:-5000,rightMm:5000,spawnDistanceMm:900},
    fighters: [animationBackedFighter("f1",clips),animationBackedFighter("f2",clips)] as const,
  };
  const state = createMatch(match);
  const result = stepMatch(state,[
    {horizontal:0 as const,vertical:0 as const,attacks:["LP" as const]},
    NEUTRAL_INPUT,
  ],match);
  assert.equal(result.state.fighters[0].moveId,"real-punch");
  assert.ok(result.events.some(event=>event.type==="attack" && event.moveId==="real-punch"));
});
