import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { createBeatWorld, stepBeatWorld } from "../src/engine/beat-em-up-world.ts";
import { demoEnemyInputs } from "../src/game/beat-enemy-ai.ts";
import { BEAT_PROJECTION, DIAGNOSTIC_ACTORS, DIAGNOSTIC_STAGE,
  diagnosticScrollBounds } from "../src/game/beat-stage.ts";
import { makeBeatCamera, placeBeatCamera } from "../src/render/beat-camera-three.ts";

test("both enemies are visible near the hero from the first frame, including portrait", () => {
  const hero = DIAGNOSTIC_ACTORS[0];
  const camera = makeBeatCamera(9 / 16);
  placeBeatCamera(camera, hero, BEAT_PROJECTION,
    diagnosticScrollBounds(DIAGNOSTIC_STAGE, BEAT_PROJECTION));
  for (const enemy of DIAGNOSTIC_ACTORS.slice(1)) {
    assert.ok(Math.abs(hero.xMm - enemy.xMm) <= 1400);
    assert.ok(Math.abs(hero.depthMm - enemy.depthMm) <= 650);
    const torso = new Vector3(enemy.xMm / 1000, 0.9, enemy.depthMm / 1000).project(camera);
    assert.ok(Math.abs(torso.x) < 0.9, `${enemy.id} outside portrait X: ${torso.x}`);
    assert.ok(Math.abs(torso.y) < 0.9, `${enemy.id} outside portrait Y: ${torso.y}`);
  }
});

test("enemies follow the hero but the kinematic world has no pushboxes", () => {
  let world = createBeatWorld(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS);
  for (let i = 0; i < 200; i++) {
    world = stepBeatWorld(world, {
      ...demoEnemyInputs(world, DIAGNOSTIC_STAGE),
      hero: { horizontal: 1, depth: 0, jump: false },
    }, DIAGNOSTIC_STAGE);
  }
  const hero = world.actors[0];
  assert.ok(hero.xMm > DIAGNOSTIC_ACTORS[0].xMm);
  for (const enemy of world.actors.slice(1)) {
    assert.ok(enemy.xMm > DIAGNOSTIC_ACTORS.find(a => a.id === enemy.id)!.xMm);
    assert.ok(Math.abs(hero.xMm - enemy.xMm) < 4000);
  }
});

test("stage boundaries apply to enemies as well as the heroine", () => {
  const enemy = { ...DIAGNOSTIC_ACTORS[1], xMm: DIAGNOSTIC_STAGE.rightMm,
    depthMm: DIAGNOSTIC_STAGE.farMm, supportingPlatformId: "ground" };
  const world = createBeatWorld(DIAGNOSTIC_STAGE, [enemy]);
  const moved = stepBeatWorld(world, {
    [enemy.id]: { horizontal: 1, depth: 1, jump: false },
  }, DIAGNOSTIC_STAGE);
  assert.equal(moved.actors[0].xMm, DIAGNOSTIC_STAGE.rightMm);
  assert.equal(moved.actors[0].depthMm, DIAGNOSTIC_STAGE.farMm);
});
