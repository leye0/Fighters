import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../assets/mixamo-available-clips.json" with { type: "json" };
import research from "../assets/mixamo-layering-research.json" with { type: "json" };

test("actual private GLB mixing evidence preserves canonical identities without approving gameplay", () => {
  assert.equal(research.schemaVersion, 1);
  assert.equal(research.verifiedForGameplay, false);
  assert.match(research.status, /visual_approval_pending/);
  const byFilename = new Map(catalog.clips.map(clip => [clip.filename, clip]));
  for (const identity of research.sourceIdentities) {
    const source = byFilename.get(identity.filename);
    assert.equal(identity.motionId, source?.motionId);
    assert.equal(identity.researchGlbSha256, source?.researchGlb?.sha256);
    assert.equal(source?.visualScreened, false);
    assert.equal(source?.runtimeStatus, "not_integrated");
  }
  assert.equal(research.combinations.length, 4);
  assert.deepEqual(new Set(research.combinations.map(combo => combo.locomotion)),
    new Set(["Fighting_Idle.fbx", "Medium_Step_Forward.fbx", "Step_Backward_3.fbx", "Jump.fbx"]));
  for (const combo of research.combinations) {
    assert.equal(combo.attack, "Lead_Jab_2.fbx");
    assert.equal(combo.sharedBones, 65);
    assert.equal(combo.conflictingTracks, 0);
    assert.equal(combo.missingBindings, 0);
    assert.equal(combo.rootTranslationAfterMixMeters, 0);
    assert.ok(combo.lowerTracks > 0 && combo.upperTracks > 0);
    assert.equal(combo.structurallyBlendable, true);
  }
  assert.ok(research.combinations.find(combo => combo.locomotion === "Medium_Step_Forward.fbx")!.sourceRootDeltaMetersXYZ[2] > 0.9);
  assert.ok(research.combinations.find(combo => combo.locomotion === "Step_Backward_3.fbx")!.sourceRootDeltaMetersXYZ[2] < -0.5);
});
