import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../assets/mixamo-available-clips.json" with { type: "json" };
import shortlist from "../assets/mixamo-shortlist.json" with { type: "json" };

test("the 60-clip research shortlist is distinct and backed by actual converted candidates", () => {
  assert.equal(shortlist.schemaVersion, 1);
  assert.equal(shortlist.status, "metadata_shortlist_only_not_visually_approved");
  const names = shortlist.groups.flatMap(group => group.filenames);
  assert.equal(names.length, 60);
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
});
