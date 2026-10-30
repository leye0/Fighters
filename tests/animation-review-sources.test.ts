import assert from "node:assert/strict";
import test from "node:test";
import full from "../assets/mixamo-available-clips.json" with { type: "json" };
import shortlist from "../assets/mixamo-shortlist.json" with { type: "json" };
import mobile from "../assets/mixamo-review-sources.json" with { type: "json" };

test("lightweight mobile review preserves all 63 canonical source IDs and exact hashes", () => {
  const source = new Map(full.clips.map(clip => [clip.filename, clip]));
  const names = shortlist.groups.flatMap(group => group.filenames);
  assert.equal(mobile.schemaVersion, 1);
  assert.deepEqual(mobile.clips.map(clip => clip.filename), names);
  for (const clip of mobile.clips) {
    const original = source.get(clip.filename);
    assert.ok(original);
    assert.equal(clip.motionId, original.motionId);
    assert.equal(clip.sha256, original.sha256);
    assert.equal(clip.researchGlb?.sha256, original.researchGlb?.sha256);
    assert.equal(clip.sourceDescription, original.sourceDescription);
  }
});
