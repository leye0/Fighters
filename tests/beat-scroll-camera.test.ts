import assert from "node:assert/strict";
import test from "node:test";
import {
  followBeatCamera, projectBeatFocus, type CameraViewport, type ScrollBounds,
} from "../src/render/beat-scroll-camera.ts";

const bounds: ScrollBounds = {
  leftMm: 0, rightMm: 18000, bottomMm: -2000, topMm: 8000,
};
const viewport: CameraViewport = { widthMm: 8000, heightMm: 4500 };
const frame = (xMm: number, verticalMm: number, view = viewport, area = bounds) =>
  followBeatCamera({ xMm, verticalMm }, area, view);

test("hero stays precisely in the screen centre away from all boundaries", () => {
  const middle = frame(9000, 3000);
  assert.deepEqual(middle.center, { xMm: 9000, verticalMm: 3000 });
  assert.deepEqual(middle.heroOffset, { xMm: 0, verticalMm: 0 });
  assert.deepEqual(middle.pinned, { left: false, right: false, bottom: false, top: false });
});

test("the left stage boundary stops scrolling and the hero approaches the left edge", () => {
  const near = frame(500, 3000);
  assert.equal(near.center.xMm, 4000);
  assert.equal(near.heroOffset.xMm, -3500);
  assert.equal(near.pinned.left, true);
  assert.equal(near.pinned.right, false);
});

test("the right boundary behaves symmetrically without following past the level", () => {
  const near = frame(17500, 3000);
  assert.equal(near.center.xMm, 14000);
  assert.equal(near.heroOffset.xMm, 3500);
  assert.equal(near.pinned.right, true);
  assert.equal(near.pinned.left, false);
});

test("top and bottom scrolling boundaries independently release the hero from the centre", () => {
  const bottom = frame(9000, -1500);
  assert.equal(bottom.center.verticalMm, 250);
  assert.equal(bottom.heroOffset.verticalMm, -1750);
  assert.equal(bottom.pinned.bottom, true);
  assert.equal(bottom.pinned.top, false);
  const top = frame(9000, 7500);
  assert.equal(top.center.verticalMm, 5750);
  assert.equal(top.heroOffset.verticalMm, 1750);
  assert.equal(top.pinned.top, true);
});

test("camera corners can be clamped simultaneously on both axes", () => {
  const corner = frame(17500, 7500);
  assert.deepEqual(corner.center, { xMm: 14000, verticalMm: 5750 });
  assert.equal(corner.pinned.right && corner.pinned.top, true);
  assert.equal(corner.pinned.left || corner.pinned.bottom, false);
});

test("a room smaller than the viewport is fully visible and never scrolls", () => {
  const room: ScrollBounds = { leftMm: 200, rightMm: 1500, bottomMm: 100, topMm: 900 };
  const state = frame(1200, 700, viewport, room);
  assert.deepEqual(state.center, { xMm: 850, verticalMm: 500 });
  assert.deepEqual(state.pinned, { left: true, right: true, top: true, bottom: true });
});

test("viewport size changes the camera clamping on mobile portrait layouts", () => {
  const portrait = frame(7000, 5000, { widthMm: 4500, heightMm: 8000 });
  assert.equal(portrait.center.xMm, 7000);
  assert.equal(portrait.center.verticalMm, 4000);
  assert.equal(portrait.heroOffset.verticalMm, 1000);
  assert.equal(portrait.pinned.top, true);
});

test("3D depth and elevation are projected to the screen-follow plane before clamping", () => {
  const projection = { focusHeightMm: 900, depthVerticalNumerator: -1, depthVerticalDenominator: 2 };
  assert.deepEqual(projectBeatFocus({ xMm: 7000, depthMm: 1000, heightMm: 1500 }, projection),
    { xMm: 7000, verticalMm: 1900 });
  assert.deepEqual(projectBeatFocus({ xMm: 7000, depthMm: -1000, heightMm: 0 }, projection),
    { xMm: 7000, verticalMm: 1400 });
  assert.throws(() => projectBeatFocus({ xMm: 0, depthMm: 0, heightMm: 0 },
    { ...projection, depthVerticalDenominator: 0 }), /positive/);
});

test("invalid bounds and viewport fail closed, and results never mutate their inputs", () => {
  const originalBounds = structuredClone(bounds);
  const originalView = structuredClone(viewport);
  frame(9000, 3000);
  assert.deepEqual(bounds, originalBounds);
  assert.deepEqual(viewport, originalView);
  assert.throws(() => frame(0, 0, { widthMm: 0, heightMm: 100 }), /positive/);
  assert.throws(() => frame(0, 0, viewport, { ...bounds, leftMm: 18000 }), /bounds/);
});
