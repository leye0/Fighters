import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../assets/mixamo-available-clips.json" with { type: "json" };
import shortlist from "../assets/mixamo-shortlist.json" with { type: "json" };

test("the 60 clips and three targeted backsteps are distinct and backed by real converted candidates", () => {
  assert.equal(shortlist.schemaVersion, 1);
  assert.equal(shortlist.status, "metadata_shortlist_only_not_visually_approved");
  const names = shortlist.groups.flatMap(group => group.filenames);
  assert.equal(names.length, 63);
  assert.equal(new Set(names).size, names.length);
  const available = new Map(catalog.clips.map(clip => [clip.filename, clip]));
  for (const name of names) {
    const clip = available.get(name);
    assert.ok(clip, `Missing real indexed clip ${name}`);
    assert.equal(clip.researchConversionStatus, "validated_private_glb", name);
    assert.equal(clip.visualScreened, false, name);
    assert.match(clip.researchGlb?.sha256 ?? "", /^[a-f0-9]{64}$/, name);
  }
  assert.ok(shortlist.groups.find(group => group.purpose === "airborne"));
  assert.ok(shortlist.groups.find(group => group.purpose === "locomotion"));
  assert.ok(shortlist.groups.find(group => group.purpose === "punch"));
  assert.deepEqual(shortlist.groups.find(group => group.purpose === "backstep_alternatives")?.filenames,
    ["Step_Backward_2.fbx", "Step_Backward_3.fbx", "Step_Backward.fbx"]);
});

test("the three additional boxing backsteps keep their exact Mixamo identities and converted hashes", () => {
  const expected = new Map([
    ["Step_Backward_2.fbx", "c9cadb92-b96c-11e4-a802-0aaa78deedf9"],
    ["Step_Backward_3.fbx", "c9cadc5e-b96c-11e4-a802-0aaa78deedf9"],
    ["Step_Backward.fbx", "c9cb4f35-b96c-11e4-a802-0aaa78deedf9"],
  ]);
  for (const [filename, motionId] of expected) {
    const clip = catalog.clips.find(clip => clip.filename === filename);
    assert.equal(clip?.motionId, motionId);
    assert.equal(clip?.researchConversionStatus, "validated_private_glb");
    assert.match(clip?.sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.match(clip?.researchGlb?.sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(clip?.runtimeStatus, "not_integrated");
  }
});
