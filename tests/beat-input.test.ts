import assert from "node:assert/strict";
import test from "node:test";
import { digitalBeatInput } from "../src/input/beat-input.ts";

test("beat'em up input separates 3D depth from jump and supports two keyboard layouts", () => {
  assert.deepEqual(digitalBeatInput(new Set(["KeyA", "KeyW"])),
    { horizontal: -1, depth: -1, jump: false });
  assert.deepEqual(digitalBeatInput(new Set(["ArrowRight", "ArrowDown", "Space"])),
    { horizontal: 1, depth: 1, jump: true });
  assert.deepEqual(digitalBeatInput(new Set(["KeyD", "KeyA", "KeyJ"])),
    { horizontal: 0, depth: 0, jump: true });
});
