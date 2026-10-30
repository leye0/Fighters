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
  assert.match(style, /\.beat-mobile-controls button\s*\{[^}]*touch-action:\s*none/);
  assert.match(runtime, /viewport\.addEventListener\("contextmenu"/);
});
