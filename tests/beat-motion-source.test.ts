import assert from "node:assert/strict";
import test from "node:test";
import { GAME_MOTION_NAMES } from "../src/render/beat-character-animator.ts";
import { CC0_ANIMATION_PROVENANCE, validateMotionSource } from
  "../src/render/beat-motion-source.ts";

function validPack() {
  const names = new Set<string>(Object.values(GAME_MOTION_NAMES));
  let i = 0;
  while (names.size < 86) names.add("UAL2_extra_" + i++);
  return [...names].map(name => ({ name,
    extras: { rigTransfer: CC0_ANIMATION_PROVENANCE, license: "CC0-1.0" } }));
}
test("all 86 CC0 native-skin animation records are accepted", () => {
  assert.doesNotThrow(() => validateMotionSource(validPack()));
});
test("legacy, mixed, missing, unknown or duplicate animation sources are rejected", () => {
  const good = validPack();
  assert.throws(() => validateMotionSource(good.slice(1)));
  assert.throws(() => validateMotionSource([...good.slice(1), good[1]]));
  assert.throws(() => validateMotionSource(good.map((entry, i) => i === 0 ?
    { ...entry, name: "Fighters_Mixamo_Fighting_Idle" } : entry)));
  assert.throws(() => validateMotionSource(good.map((entry, i) => i === 5 ?
    { ...entry, extras: { rigTransfer: "warconquer-inverse-bind-world-v1", license: "CC0-1.0" } } : entry)));
  assert.throws(() => validateMotionSource(good.map((entry, i) => i === 6 ?
    { ...entry, extras: { rigTransfer: CC0_ANIMATION_PROVENANCE, license: "adobe-mixamo" } } : entry)));
});
