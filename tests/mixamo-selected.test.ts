import assert from "node:assert/strict";
import test from "node:test";
import source from "../assets/mixamo-available-clips.json" with { type: "json" };
import shortlist from "../assets/mixamo-shortlist.json" with { type: "json" };
import review from "../assets/mixamo-review-sources.json" with { type: "json" };
import selected from "../assets/mixamo-selected.json" with { type: "json" };

test("all 63 owner-selected Mixamo clips retain exact source and research GLB identities", () => {
  const originals = new Map(source.clips.map(clip => [clip.filename, clip]));
  const ordered = shortlist.groups.flatMap(group => group.filenames);
  assert.equal(selected.schemaVersion, 1);
  assert.equal(selected.status, "selected_for_integration_not_runtime_approved");
  assert.equal(selected.review.decision, "keep_all_63");
  assert.equal(selected.review.scope, "source_animation_selection_only");
  assert.equal(selected.clips.length, 63);
  assert.equal(new Set(selected.clips.map(clip => clip.filename)).size, 63);
  assert.deepEqual(selected.clips.map(clip => clip.filename), ordered);
  assert.deepEqual(selected.clips.map(clip => clip.filename), review.clips.map(clip => clip.filename));

  for (const clip of selected.clips) {
    const actual = originals.get(clip.filename);
    assert.ok(actual, `Unknown original Mixamo clip: ${clip.filename}`);
    assert.equal(clip.choice, "keep");
    assert.equal(clip.motionId, actual.motionId);
    assert.equal(clip.sourceDescription, actual.sourceDescription);
    assert.equal(clip.sourceSha256, actual.sha256);
    assert.equal(clip.researchGlbSha256, actual.researchGlb?.sha256);
  }
});
