import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { makeBeatCamera, beatCameraViewport, placeBeatCamera } from "../src/render/beat-camera-three.ts";
import { BEAT_PROJECTION, DIAGNOSTIC_STAGE, diagnosticScrollBounds } from "../src/game/beat-stage.ts";
import type { ScrollBounds } from "../src/render/beat-scroll-camera.ts";

const broad: ScrollBounds = { leftMm: -40000, rightMm: 40000, bottomMm: -30000, topMm: 30000 };
function projected(x: number, y: number, z: number, aspect = 16 / 9, bounds = broad) {
  const camera = makeBeatCamera(aspect);
  const focus = { xMm: x, heightMm: y, depthMm: z };
  const frame = placeBeatCamera(camera, focus, BEAT_PROJECTION, bounds);
  const screen = new Vector3(x / 1000, (y + BEAT_PROJECTION.focusHeightMm) / 1000, z / 1000)
    .project(camera);
  return { frame, screen, camera };
}

test("3D camera centers the actual hero pixel in landscape and portrait, regardless of depth or jump", () => {
  for (const aspect of [16 / 9, 9 / 16, 21 / 9]) {
    for (const [x, y, z] of [[0, 0, 0], [8000, 0, -3500], [-4000, 2650, 1200], [0, 1600, 3400]]) {
      const { frame, screen } = projected(x, y, z, aspect);
      assert.deepEqual(frame.heroOffset, { xMm: 0, verticalMm: 0 });
      assert.ok(Math.abs(screen.x) < 0.0003, `horizontal NDC ${screen.x}`);
      assert.ok(Math.abs(screen.y) < 0.0003, `vertical NDC ${screen.y}`);
    }
  }
});

test("four camera boundaries constrain each axis independently, including corners", () => {
  const bounds = diagnosticScrollBounds(DIAGNOSTIC_STAGE, BEAT_PROJECTION);
  const left = projected(-18000, 0, 0, 16 / 9, bounds);
  const right = projected(18000, 0, 0, 16 / 9, bounds);
  const bottom = projected(0, 0, 4500, 16 / 9, bounds);
  const top = projected(8000, 2650, -2200, 16 / 9, bounds);
  assert.equal(left.frame.pinned.left, true);
  assert.ok(left.screen.x < 0);
  assert.equal(right.frame.pinned.right, true);
  assert.ok(right.screen.x > 0);
  assert.equal(bottom.frame.pinned.bottom, true);
  assert.ok(bottom.screen.y < 0);
  assert.equal(top.frame.pinned.top, true);
  assert.ok(top.screen.y > 0);
  const corner = projected(-18000, 0, 4500, 9 / 16, bounds);
  assert.equal(corner.frame.pinned.left, true);
  assert.equal(corner.frame.pinned.bottom, true);
  assert.ok(corner.screen.x < 0 && corner.screen.y < 0);
});

test("real focal length and aspect ratio change logical visible extents", () => {
  const wide = beatCameraViewport(makeBeatCamera(16 / 9));
  const portrait = beatCameraViewport(makeBeatCamera(9 / 16));
  assert.ok(wide.widthMm > portrait.widthMm);
  assert.equal(wide.heightMm, portrait.heightMm);
  assert.ok(wide.heightMm > 0 && wide.widthMm > 0);
});
