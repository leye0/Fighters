import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../beat-em-up.html", import.meta.url), "utf8");
const style = readFileSync(new URL("../src/beat-em-up.css", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/beat-em-up.ts", import.meta.url), "utf8");

test("portrait mode gates the stage, pauses simulation and releases controls", () => {
  assert.match(page, /id="beat-orientation-gate"/);
  assert.match(page, /Mode paysage requis/);
  assert.match(style, /@media \(orientation: portrait\)/);
  assert.match(style, /\.beat-orientation-gate\s*\{\s*display:\s*flex/);
  assert.match(runtime, /matchMedia\("\(orientation: portrait\)"\)/);
  assert.match(runtime, /controls\.reset\(\)/);
  assert.match(runtime, /accumulator = 0/);
  assert.match(runtime, /requestAnimationFrame\(frame\);\s*return;/);
});

test("mobile controls cannot select text or trigger browser gestures", () => {
  assert.match(style, /user-select:\s*none/);
  assert.match(style, /-webkit-touch-callout:\s*none/);
  assert.match(style, /\.beat-viewport\s*\{[^}]*touch-action:\s*none/);
  assert.match(style, /\.beat-steering-zone\s*\{[^}]*touch-action:\s*none/);
  assert.match(style, /\.beat-strike-zone\s*\{[^}]*touch-action:\s*none/);
  assert.match(runtime, /viewport\.addEventListener\("contextmenu"/);
});

test("touch screen has no direction buttons and four large 10%-fill/20%-outline strike zones", () => {
  assert.match(page, /id="beat-steering-zone"/);
  assert.doesNotMatch(page, /data-beat-key="Arrow(?:Left|Right|Up|Down)"/);
  assert.equal([...page.matchAll(/data-beat-attack=/g)].length, 4);
  assert.match(page, /id="beat-jump-button"/);
  assert.match(page, /data-beat-attack="kickFront"/);
  assert.match(page, /data-beat-attack="kickRound"/);
  assert.match(style, /\.beat-action-pad\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  assert.match(style, /\.beat-strike-zone\s*\{[^}]*rgb\([^)]*\/ 20%\)/);
  assert.match(style, /\.beat-strike-zone\s*\{[^}]*rgb\([^)]*\/ 10%\)/);
  assert.match(style, /\.beat-jump-center\s*\{[^}]*border-radius:\s*50%/);
});
