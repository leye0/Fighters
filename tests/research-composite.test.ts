import assert from "node:assert/strict";
import test from "node:test";
import report from "../assets/mixamo-layering-research.json" with { type: "json" };
import { assertMatchingResearchRig, researchGlbStem, researchWorldOffset, RESEARCH_ATTACK, RESEARCH_COMPOSITES } from "../src/render/research-composite.ts";

test("visual composites use the exact five SHA-tracked real GLB identities", () => {
  const names = new Set(report.sourceIdentities.map(source => source.filename.slice(0, -4)));
  assert.equal(names.size, 5);
  assert.deepEqual(new Set([RESEARCH_ATTACK, ...RESEARCH_COMPOSITES.map(clip => clip.source)]), names);
  for (const source of report.sourceIdentities) {
    assert.match(source.researchGlbSha256, /^[a-f\d]{64}$/);
    assert.equal(researchGlbStem(source.filename.replace(/\.fbx$/, ".glb")), source.filename.slice(0, -4));
  }
});

test("untrusted upload names cannot resolve outside known GLB basenames", () => {
  for (const name of ["../Jump.glb", "Jump.fbx", "Jump.glb.exe", "Jump/evil.glb", "Jump%2F.glb"]) {
    assert.equal(researchGlbStem(name), null);
  }
  assert.equal(researchGlbStem("Step_Backward_3.glb"), "Step_Backward_3");
});

test("rig compatibility refuses partial and mismatched skeletons", () => {
  assert.doesNotThrow(() => assertMatchingResearchRig(["Hips", "Spine", "Head"], ["Head", "Hips", "Spine"]));
  assert.throws(() => assertMatchingResearchRig(["Hips", "Spine"], ["Hips", "Head"]));
  assert.throws(() => assertMatchingResearchRig([], []));
});

test("reference forward/back displacement respects the source clip and jump stays on the vertical arc", () => {
  const forward = RESEARCH_COMPOSITES.find(clip => clip.id === "forward")!;
  const backward = RESEARCH_COMPOSITES.find(clip => clip.id === "backward")!;
  const jump = RESEARCH_COMPOSITES.find(clip => clip.id === "jump")!;
  assert.equal(researchWorldOffset(forward, .9333, .9333).x, .9172);
  assert.equal(researchWorldOffset(backward, .8, .8).x, -.5983);
  assert.deepEqual(researchWorldOffset(jump, 1, 2), { x: 0, y: .45 });
  assert.equal(researchWorldOffset(jump, 2, 2).y < 1e-14, true);
  assert.throws(() => researchWorldOffset(jump, 1, 0));
});
