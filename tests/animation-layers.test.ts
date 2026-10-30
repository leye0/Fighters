import test from "node:test";
import assert from "node:assert/strict";
import { AnimationClip, AnimationMixer, Group, Object3D, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";
import { isUpperBodyTrack, maskClip, trackBoneName } from "../src/render/animation-layers.ts";

const rotations = (name: string) => new QuaternionKeyframeTrack(name, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);

test("Mixamo and GLTF bone bindings are normalized for animation layers", () => {
  assert.equal(trackBoneName("mixamorig:LeftForeArm.quaternion"), "leftforearm");
  assert.equal(trackBoneName("Armature.bones[mixamorigSpine2].quaternion"), "spine2");
  assert.ok(isUpperBodyTrack("mixamorigLeftHandIndex1.quaternion"));
  assert.ok(!isUpperBodyTrack("mixamorigLeftUpLeg.quaternion"));
  assert.ok(!isUpperBodyTrack("mixamorigHips.position"));
});

test("upper-body punch and lower-body jump have no competing tracks", () => {
  const clip = new AnimationClip("jump-punch", 1, [
    rotations("mixamorigHips.quaternion"),
    new VectorKeyframeTrack("mixamorigHips.position", [0, 1], [0, 0, 0, 0, 1, 0]),
    rotations("mixamorigLeftUpLeg.quaternion"),
    rotations("mixamorigSpine.quaternion"),
    rotations("mixamorigRightArm.quaternion"),
  ]);
  const upper = maskClip(clip, "upperBody");
  const lower = maskClip(clip, "lowerBody");
  assert.deepEqual(upper.tracks.map(track => track.name), [
    "mixamorigSpine.quaternion", "mixamorigRightArm.quaternion",
  ]);
  assert.deepEqual(lower.tracks.map(track => track.name), [
    "mixamorigHips.quaternion", "mixamorigLeftUpLeg.quaternion",
  ]);
  assert.ok(upper.tracks.every(track => !lower.tracks.some(other => other.name === track.name)));
  assert.notEqual(upper.tracks[0], clip.tracks[3]);
});

test("a clip without arm or torso tracks is not silently treated as an upper-body strike", () => {
  assert.throws(() => maskClip(new AnimationClip("legs", 1, [rotations("mixamorigLeftLeg.quaternion")]), "upperBody"), /No upperBody/);
});

test("one Three.js mixer really plays an airborne leg motion and a punch at the same time", () => {
  const body = new Group();
  const leg = new Object3D();
  leg.name = "mixamorigLeftUpLeg";
  const arm = new Object3D();
  arm.name = "mixamorigRightArm";
  body.add(leg, arm);
  const curve = [0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068];
  const jump = new AnimationClip("jump", 1, [
    new QuaternionKeyframeTrack("mixamorigLeftUpLeg.quaternion", [0, 1], curve),
    rotations("mixamorigRightArm.quaternion"),
  ]);
  const punch = new AnimationClip("punch", 1, [
    rotations("mixamorigLeftUpLeg.quaternion"),
    new QuaternionKeyframeTrack("mixamorigRightArm.quaternion", [0, 1], curve),
  ]);
  const mixer = new AnimationMixer(body);
  mixer.clipAction(maskClip(jump, "lowerBody")).play();
  mixer.clipAction(maskClip(punch, "upperBody")).play();
  mixer.update(0.5);
  assert.ok(leg.quaternion.y > 0.2);
  assert.ok(arm.quaternion.y > 0.2);
});
