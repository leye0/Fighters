import assert from "node:assert/strict";
import test from "node:test";
import { digitalBeatInput, swipeBeatDirection } from "../src/input/beat-input.ts";

test("beat'em up input separates 3D depth from jump and supports two keyboard layouts", () => {
  assert.deepEqual(digitalBeatInput(new Set(["KeyA", "KeyW"])),
    { horizontal: -1, depth: -1, jump: false, drop: false });
  assert.deepEqual(digitalBeatInput(new Set(["ArrowRight", "ArrowDown", "Space"])),
    { horizontal: 1, depth: 1, jump: true, drop: false });
  assert.deepEqual(digitalBeatInput(new Set(["KeyD", "KeyA", "KeyJ"])),
    { horizontal: 0, depth: 0, jump: true, drop: false });
  assert.deepEqual(digitalBeatInput(new Set(["KeyK", "ArrowUp"])),
    { horizontal: 0, depth: -1, jump: false, drop: true });
});

test("free-form thumb swipe gives held eight-way motion with deadzone and reversal", () => {
  assert.deepEqual(swipeBeatDirection(0, 0), { horizontal: 0, depth: 0 });
  assert.deepEqual(swipeBeatDirection(10, 5), { horizontal: 0, depth: 0 });
  assert.deepEqual(swipeBeatDirection(100, 2), { horizontal: 1, depth: 0 });
  assert.deepEqual(swipeBeatDirection(-100, 0), { horizontal: -1, depth: 0 });
  assert.deepEqual(swipeBeatDirection(0, -70), { horizontal: 0, depth: -1 });
  assert.deepEqual(swipeBeatDirection(0, 70), { horizontal: 0, depth: 1 });
  assert.deepEqual(swipeBeatDirection(80, -80), { horizontal: 1, depth: -1 });
  assert.deepEqual(swipeBeatDirection(-80, 80), { horizontal: -1, depth: 1 });
  assert.deepEqual(swipeBeatDirection(Number.NaN, 20), { horizontal: 0, depth: 0 });
});
