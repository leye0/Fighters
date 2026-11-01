import assert from "node:assert/strict";
import test from "node:test";
import { GAME_MOTION_NAMES } from "../src/render/beat-character-animator.ts";
import { FIGHTERS_MOTION_PROVENANCE, validateMotionSource } from
  "../src/render/beat-motion-source.ts";

function validPack() {
  const names = new Set<string>(Object.values(GAME_MOTION_NAMES).filter(name => name.startsWith("UAL")));
  let i = 0;
  while (names.size < 86) names.add("UAL2_extra_" + i++);
  return [...names, "ACCAD_Front_Kick", "ACCAD_Roundhouse_Kick"].map(name => ({ name,
    extras: { rigTransfer: FIGHTERS_MOTION_PROVENANCE,
      license: name.startsWith("ACCAD_") ? "CC-BY-3.0" : "CC0-1.0" } }));
}
test("86 CC0 and two credited CC BY foot strikes on native skins are accepted", () => {
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
    { ...entry, extras: { rigTransfer: FIGHTERS_MOTION_PROVENANCE, license: "adobe-mixamo" } } : entry)));
  assert.throws(() => validateMotionSource(good.map(entry => entry.name === "ACCAD_Front_Kick" ?
    { ...entry, extras: { ...entry.extras, license: "CC0-1.0" } } : entry)),
    "ACCAD copyright cannot be laundered as CC0");
});
