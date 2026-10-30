import test from "node:test";
import assert from "node:assert/strict";
import { createAiBrain, decideAiInput, runAiBattle } from "../src/engine/ai.ts";
import { createMatch, type InputFrame, type MatchDefinition } from "../src/engine/simulation.ts";
import { DEFAULT_STAGE, fighterDefinition } from "../src/game/roster-config.ts";

const definition = (): MatchDefinition => ({
  stage: DEFAULT_STAGE,
  fighters: [fighterDefinition("CPU-A"), fighterDefinition("CPU-B")],
});

test("AI uses normal InputFrames and leaves the authoritative match untouched", () => {
  const state = createMatch(definition());
  const snapshot = structuredClone(state);
  const brain = createAiBrain(42);
  const { input, brain: next } = decideAiInput(state, 0, brain, definition().fighters[0]);
  assert.deepEqual(state, snapshot);
  assert.ok([-1, 0, 1].includes(input.horizontal));
  assert.ok([-1, 0, 1].includes(input.vertical));
  assert.ok(Array.isArray(input.attacks));
  assert.deepEqual(createAiBrain(42), brain);
  assert.ok(next.seed > 0);
});

test("AI battle is byte-for-byte deterministic from seeds and profiles", () => {
  const one = runAiBattle(definition(), [31, 52], ["aggressive", "defensive"]);
  const two = runAiBattle(definition(), [31, 52], ["aggressive", "defensive"]);
  assert.equal(JSON.stringify(one), JSON.stringify(two));
  assert.equal(one.conclusion, "ko");
});

test("several real simulated duels produce hits, special moves and a KO", () => {
  const seeds: [number, number][] = [[1, 2], [5, 19], [123, 456], [42, 999], [8765, 4321]];
  let sawCombo = false;
  for (const pair of seeds) {
    const report = runAiBattle(definition(), pair);
    assert.equal(report.conclusion, "ko", JSON.stringify(report));
    assert.ok(report.hits[0] + report.hits[1] >= 6, JSON.stringify(report));
    assert.ok(report.specialAttacks[0] + report.specialAttacks[1] >= 2, JSON.stringify(report));
    assert.ok(report.attacks.every(value => value >= 4), JSON.stringify(report));
    assert.deepEqual(report.diagnosticWarnings, [], JSON.stringify(report));
    sawCombo ||= report.cancels[0] + report.cancels[1] > 0;
  }
  assert.equal(sawCombo, true, "at least one AI should execute a real hit-confirmed chain");
});

test("defensive and balanced AI profiles can still finish a match", () => {
  for (const profiles of [
    ["defensive", "defensive"], ["aggressive", "defensive"],
    ["balanced", "balanced"], ["defensive", "balanced"],
  ] as const) {
    const report = runAiBattle(definition(), [31, 52], profiles);
    assert.equal(report.conclusion, "ko");
    assert.deepEqual(report.diagnosticWarnings, []);
  }
});

test("AI battle report distinguishes time limit from KO", () => {
  const report = runAiBattle(definition(), [1, 2], ["balanced", "balanced"], 10);
  assert.equal(report.conclusion, "time-limit");
  assert.equal(report.ticks, 10);
  assert.ok(report.diagnosticWarnings.some(message => message.includes("No KO")));
});

test("AI rejects invalid seeds and overly broad tick budgets", () => {
  assert.throws(() => createAiBrain(1.2), /seed/);
  assert.throws(() => createAiBrain(1, "unknown" as never), /profile/);
  assert.throws(() => runAiBattle(definition(), [1, 2], ["balanced", "balanced"], 0), /budget/);
});

test("different seeds produce different combat decisions without changing combat rules", () => {
  const a = runAiBattle(definition(), [1, 2]);
  const b = runAiBattle(definition(), [5, 19]);
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(definition().fighters[0], fighterDefinition("CPU-A"));
});
