import test from "node:test";
import assert from "node:assert/strict";
import { qualityProfile, renderPixelRatio } from "../src/render/quality.ts";

test("Ultra preserves the greatest shadow and pixel budget", () => {
  assert.ok(qualityProfile("ultra").shadowMapSize > qualityProfile("high").shadowMapSize);
  assert.ok(qualityProfile("high").shadowMapSize > qualityProfile("medium").shadowMapSize);
  assert.ok(qualityProfile("medium").shadowMapSize > qualityProfile("low").shadowMapSize);
});
test("pixel ratio is capped explicitly without losing a valid lower DPR", () => {
  assert.equal(renderPixelRatio("ultra",3),2);
  assert.equal(renderPixelRatio("low",2),1);
  assert.equal(renderPixelRatio("high",1.25),1.25);
  assert.equal(renderPixelRatio("medium",Number.NaN),1);
});
