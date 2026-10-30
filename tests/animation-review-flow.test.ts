import assert from "node:assert/strict";
import test from "node:test";
import shortlist from "../assets/mixamo-shortlist.json" with { type: "json" };
import { nextUnreviewed } from "../src/animation-review-flow.ts";

test("guided review cycles through all 63 real shortlisted identities", () => {
  const files = shortlist.groups.flatMap(group => group.filenames);
  assert.equal(files.length, 63);
  assert.equal(new Set(files).size, 63);
  const choices: Record<string, { choice: string }> = {};
  let current = files[0];
  const visited = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    visited.add(current);
    choices[current] = { choice: i % 2 ? "reject" : "keep" };
    current = nextUnreviewed(files, current, choices) ?? "";
  }
  assert.equal(visited.size, 63);
  assert.equal(current, "");
});

test("guided review skips already marked clips and wraps around", () => {
  const files = ["A.fbx", "B.fbx", "C.fbx", "D.fbx"];
  assert.equal(nextUnreviewed(files, "A.fbx", { "B.fbx": { choice: "keep" } }), "C.fbx");
  assert.equal(nextUnreviewed(files, "D.fbx", { "A.fbx": { choice: "reject" } }), "B.fbx");
  assert.equal(nextUnreviewed(files, "C.fbx", Object.fromEntries(files.map(name => [name, { choice: "keep" }]))), null);
  assert.equal(nextUnreviewed([], "", {}), null);
});
