import assert from "node:assert/strict";
import test from "node:test";
import {
  createBeatWorld, stepBeatWorld, validateBeatStage, NEUTRAL_BEAT_INPUT,
  type BeatActor, type BeatStage, type BeatWorldState,
} from "../src/engine/beat-em-up-world.ts";

const stage: BeatStage = {
  leftMm: -6000, rightMm: 10000, nearMm: -2000, farMm: 2000,
  gravityMmPerTick2: 20, stepUpMm: 180, stepDownMm: 220,
  targetAcquireMm: 1600, targetReleaseMm: 2200, targetMaxHeightMm: 1000,
  platforms: [
    { id: "street", leftMm: -6000, rightMm: 10000, nearMm: -2000, farMm: 2000, topMm: 0 },
    { id: "dumpster", leftMm: 1000, rightMm: 2500, nearMm: -500, farMm: 500, topMm: 900 },
    { id: "roof", leftMm: 4000, rightMm: 9500, nearMm: -600, farMm: 600, topMm: 3000 },
  ],
};
function actor(id: string, xMm = 0, overrides: Partial<BeatActor> = {}): BeatActor {
  return {
    id, team: id === "hero" ? "heroes" : "hostiles", alive: true,
    xMm, depthMm: 0, heightMm: 0, verticalVelocityMmPerTick: 0,
    supportingPlatformId: "street", speedMmPerTick: 150,
    jumpSpeedMmPerTick: 260, facing: 1, targetId: null, ...overrides,
  };
}
function step(world: BeatWorldState, inputs: Parameters<typeof stepBeatWorld>[1] = {}) {
  return stepBeatWorld(world, inputs, stage);
}

test("3D street, dumpster and rooftop platforms require valid bounded integer surfaces", () => {
  validateBeatStage(stage);
  const initial = createBeatWorld(stage, [actor("hero"), actor("enemy", 3000)]);
  assert.equal(initial.tick, 0);
  assert.equal(initial.actors[0].supportingPlatformId, "street");
  assert.throws(() => createBeatWorld(stage, [actor("hero"), actor("hero")]), /actor ID/);
  assert.throws(() => validateBeatStage({ ...stage, targetReleaseMm: 100 }), /release range/);
  assert.throws(() => validateBeatStage({ ...stage, platforms: [stage.platforms[0], stage.platforms[0]] }), /Duplicate/);
  assert.throws(() => createBeatWorld(stage, [actor("hero", 1200)]), /spawn on named support/);
});

test("horizontal travel, depth and diagonal movement are independent of facing", () => {
  let world = createBeatWorld(stage, [actor("hero"), actor("enemy", 3500)]);
  world = step(world, { hero: { horizontal: 1, depth: -1, jump: false } });
  assert.equal(world.actors[0].xMm, Math.trunc(150 * 181 / 256));
  assert.equal(world.actors[0].depthMm, -Math.trunc(150 * 181 / 256));
  world = step(world, { hero: { horizontal: -1, depth: 0, jump: false } });
  assert.equal(world.actors[0].xMm, Math.trunc(150 * 181 / 256) - 150);
  assert.throws(() => step(world, { hero: { horizontal: 5 as 1, depth: 0, jump: false } }), /Invalid beat/);
});

test("a raised dumpster blocks walking but permits jumping onto its real top surface", () => {
  let world = createBeatWorld(stage, [actor("hero", 850)]);
  world = step(world, { hero: { horizontal: 1, depth: 0, jump: false } });
  assert.equal(world.actors[0].xMm, 850, "cannot walk through a 900 mm solid platform");
  world = step(world, { hero: { horizontal: 0, depth: 0, jump: true } });
  assert.equal(world.actors[0].supportingPlatformId, null);
  assert.ok(world.actors[0].heightMm > 0);
  for (let i = 0; i < 7; i++) world = step(world);
  world = step(world, { hero: { horizontal: 1, depth: 0, jump: false } });
  assert.equal(world.actors[0].xMm, 1000);
  for (let i = 0; i < 40; i++) world = step(world);
  assert.equal(world.actors[0].heightMm, 900);
  assert.equal(world.actors[0].supportingPlatformId, "dumpster");
});

test("leaving a roof starts an actual fall and lands on the street, not a teleport", () => {
  let world = createBeatWorld(stage, [
    actor("hero", 9460, { heightMm: 3000, supportingPlatformId: "roof" }),
  ]);
  world = step(world, { hero: { horizontal: 1, depth: 0, jump: false } });
  assert.equal(world.actors[0].xMm, 9610);
  assert.equal(world.actors[0].supportingPlatformId, null);
  assert.ok(world.actors[0].heightMm < 3000);
  assert.ok(world.actors[0].heightMm > 0);
  for (let i = 0; i < 50; i++) world = step(world);
  assert.equal(world.actors[0].heightMm, 0);
  assert.equal(world.actors[0].supportingPlatformId, "street");
});

test("hero faces a nearby enemy even while retreating; loses lock only beyond release", () => {
  let world = createBeatWorld(stage, [actor("hero", 0, { facing: -1 }), actor("enemy", 1100, { depthMm: 600 })]);
  world = step(world);
  assert.equal(world.actors[0].targetId, "enemy");
  assert.equal(world.actors[0].facing, 1);
  world = step(world, { hero: { horizontal: -1, depth: 0, jump: false } });
  assert.equal(world.actors[0].facing, 1);
  assert.equal(world.actors[0].xMm, -150);
  for (let i = 0; i < 8; i++) {
    world = step(world, { hero: { horizontal: -1, depth: 0, jump: false } });
  }
  assert.equal(world.actors[0].targetId, null);
  assert.equal(world.actors[0].facing, -1);
});

test("target acquisition is deterministic, stable with several hostiles, and ignores defeated actors", () => {
  let world = createBeatWorld(stage, [
    actor("hero"), actor("zulu", 900), actor("alpha", -900),
    actor("friend", 200, { team: "heroes" }),
  ]);
  world = step(world);
  assert.equal(world.actors[0].targetId, "alpha", "lexicographic tie breaks are stable");
  world = step(world, { alpha: { horizontal: -1, depth: 0, jump: false } });
  assert.equal(world.actors[0].targetId, "alpha", "keep lock inside release distance");
  world = { ...world, actors: world.actors.map(a => a.id === "alpha" ? { ...a, alive: false } : a) };
  world = step(world);
  assert.equal(world.actors[0].targetId, "zulu");
  function play() {
    let state = createBeatWorld(stage, [actor("hero"), actor("zulu", 900), actor("alpha", -900)]);
    for (let i = 0; i < 30; i++) {
      state = step(state, { hero: { horizontal: i % 2 ? 1 : -1, depth: 0, jump: i === 2 } });
    }
    return JSON.stringify(state);
  }
  assert.equal(play(), play());
});

test("fighters on different elevations do not auto-lock across impassable height differences", () => {
  let world = createBeatWorld(stage, [
    actor("hero", 3900), actor("enemy", 4400, { heightMm: 3000, supportingPlatformId: "roof" }),
  ]);
  world = step(world);
  assert.equal(world.actors[0].targetId, null);
});

test("old-school ghosts: actors can overlap and cross without pushback", () => {
  let world = createBeatWorld(stage, [actor("hero", 0), actor("enemy", 150)]);
  world = step(world, {
    hero: { horizontal: 1, depth: 0, jump: false },
    enemy: { horizontal: -1, depth: 0, jump: false },
  });
  assert.equal(world.actors[0].xMm, 150, "hero crosses enemy's previous position");
  assert.equal(world.actors[1].xMm, 0, "enemy crosses hero's previous position");
  assert.equal(world.actors[0].targetId, "enemy", "targeting stays separate from solidity");
  const stacked = createBeatWorld(stage, [actor("hero", 0), actor("enemy", 0)]);
  assert.equal(stacked.actors[0].xMm, stacked.actors[1].xMm, "overlapping spawns are legal");
});

test("scripted drop passes through a one-way platform then lands on the street", () => {
  const withDrop: BeatStage = {
    ...stage,
    platforms: stage.platforms.map(p => p.id === "dumpster" ? { ...p, dropThrough: true } : p),
  };
  let world = createBeatWorld(withDrop, [actor("hero", 1500, {
    heightMm: 900, supportingPlatformId: "dumpster",
  })]);
  world = stepBeatWorld(world, { hero: { horizontal: 0, depth: 0, jump: false, drop: true } }, withDrop);
  assert.equal(world.actors[0].supportingPlatformId, null);
  assert.ok(world.actors[0].heightMm < 900);
  for (let i = 0; i < 20; i++) world = stepBeatWorld(world, {}, withDrop);
  assert.equal(world.actors[0].heightMm, 0);
  assert.equal(world.actors[0].supportingPlatformId, "street");
});

test("drop command cannot pass through ordinary solid platforms", () => {
  let world = createBeatWorld(stage, [actor("hero", 1500, {
    heightMm: 900, supportingPlatformId: "dumpster",
  })]);
  world = step(world, { hero: { horizontal: 0, depth: 0, jump: false, drop: true } });
  assert.equal(world.actors[0].heightMm, 900);
  assert.equal(world.actors[0].supportingPlatformId, "dumpster");
});

test("input does not mutate previous world state", () => {
  const world = createBeatWorld(stage, [actor("hero"), actor("enemy", 1300, { depthMm: 1000 })]);
  const before = structuredClone(world);
  step(world, { hero: { horizontal: 1, depth: 1, jump: false } });
  assert.deepEqual(world, before);
  assert.deepEqual(NEUTRAL_BEAT_INPUT, { horizontal: 0, depth: 0, jump: false });
});
