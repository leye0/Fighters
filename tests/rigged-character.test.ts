import assert from "node:assert/strict";
import test from "node:test";
import { Bone, Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial,
  Skeleton, SkinnedMesh, Vector3 } from "three";
import { CHARACTER_MODEL_FILES, fitRigToActor, requireSkinnedRig,
} from "../src/render/rigged-character.ts";

test("real-rig placement aligns the feet to ground without deforming proportions", () => {
  const source = new Group();
  const mesh = new Mesh(new BoxGeometry(0.5, 2, 0.3), new MeshStandardMaterial());
  mesh.position.set(7, 3, -5);
  source.add(mesh);
  fitRigToActor(source, 1.75);
  const bounds = new Box3().setFromObject(source);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  assert.ok(Math.abs(bounds.min.y) < 1e-8);
  assert.ok(Math.abs(size.y - 1.75) < 1e-8);
  assert.ok(Math.abs(center.x) < 1e-8);
  assert.ok(Math.abs(center.z) < 1e-8);
  assert.ok(Math.abs(size.x / size.y - 0.25) < 1e-8, "uniform scaling only");
});

test("invalid or empty character rigs are rejected, never replaced by capsules", () => {
  assert.throws(() => fitRigToActor(new Group(), 1.75), /no usable/);
  assert.throws(() => fitRigToActor(new Group(), 0), /Invalid character/);
  assert.throws(() => requireSkinnedRig(new Group()), /rigged human/);
});

test("skinned models require actual bones and cached model paths are real GLBs", () => {
  const source = new Group();
  const bone = new Bone();
  const model = new SkinnedMesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial());
  model.add(bone);
  model.bind(new Skeleton([bone]));
  source.add(model);
  assert.doesNotThrow(() => requireSkinnedRig(source));
  assert.deepEqual(Object.keys(CHARACTER_MODEL_FILES).sort(), ["carla", "claudia", "realistic-man"]);
  for (const path of Object.values(CHARACTER_MODEL_FILES)) assert.match(path, /^models\/[a-z-]+\.glb$/);
});
