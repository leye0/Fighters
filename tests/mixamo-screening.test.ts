import test from "node:test";
import assert from "node:assert/strict";
import shortlist from "../assets/mixamo-shortlist.json" with { type: "json" };
import screening from "../assets/mixamo-screening.json" with { type: "json" };

test("the provisional screening covers the original 60 and three backstep alternatives", () => {
  assert.equal(screening.schemaVersion, 1);
  assert.equal(screening.status, "provisional_visual_screening_not_approved");
  const expected = shortlist.groups.flatMap(group => group.filenames);
  const reviewed = screening.clips.map(clip => clip.filename);
  assert.equal(reviewed.length, 63);
  assert.deepEqual(reviewed, expected);
  assert.equal(new Set(reviewed).size, 63);
  for (const clip of screening.clips) {
    assert.ok(["promising", "compare", "deprioritize"].includes(clip.triage), clip.filename);
    assert.ok(clip.observation.length >= 30, clip.filename);
  }
  assert.match(screening.basis, /v000/);
  assert.match(screening.basis, /four camera views/);
});

test("the preliminary ranking is not mistaken for approved game content", () => {
  assert.ok(screening.clips.some(clip => clip.triage === "deprioritize"));
  assert.ok(screening.clips.some(clip => clip.triage === "compare"));
  assert.ok(screening.clips.some(clip => clip.triage === "promising"));
  assert.doesNotMatch(screening.status, /^approved$/);
});
