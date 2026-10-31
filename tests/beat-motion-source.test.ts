import assert from "node:assert/strict";
import test from "node:test";
import { GAME_MOTION_NAMES } from "../src/render/beat-character-animator.ts";
import { validateMotionSource } from "../src/render/beat-motion-source.ts";

const names = Object.values(GAME_MOTION_NAMES);
const pack = (marker: string) =>
  names.map(name => ({ name, extras: { retargeting: marker } }));

test("existing WarConquer-baked gameplay packs remain accepted", () => {
  assert.equal(validateMotionSource(pack("warconquer-inverse-bind-world-v1")),
    "legacy-ybot-rebind");
});
test("native same-rig Mixamo FBX bundle is accepted as separate safe source", () => {
  assert.equal(validateMotionSource(pack("same-rig-mixamo-fbx-v1")), "native-same-rig");
});
test("never silently retarget missing, mixed or duplicate movements", () => {
  const native = pack("same-rig-mixamo-fbx-v1");
  assert.throws(() => validateMotionSource(native.slice(1)));
  assert.throws(() => validateMotionSource([...native,native[0]]));
  assert.throws(() => validateMotionSource(native.map((c,i)=>i===2?
    { ...c, name:"Fighters_Mixamo_Made_Up" }:c)));
  assert.throws(() => validateMotionSource(native.map((c,i)=>i===0?
    { ...c, extras:{retargeting:"warconquer-inverse-bind-world-v1"} }:c)));
  assert.throws(() => validateMotionSource(pack("unrecognized-source")));
  assert.throws(() => validateMotionSource(names.map(name=>({name}))));
});
