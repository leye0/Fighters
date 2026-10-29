import test from "node:test";
import assert from "node:assert/strict";
import {
  TICKS_PER_SECOND, createMatch, stepMatch, validateMatchDefinition, NEUTRAL_INPUT,
  type MatchDefinition, type MoveDefinition, type InputFrame, type MatchState,
} from "../src/engine/simulation.ts";

const jab: MoveDefinition = {
  id: "jab", button: "LP", startupTicks: 1, activeTicks: 3, recoveryTicks: 4,
  damage: 20, chipDamage: 2, rangeMm: 1000, maxTargetHeightMm: 450,
  level: "mid", hitstunTicks: 5, blockstunTicks: 3, pushbackMm: 50,
};
const low: MoveDefinition = { ...jab, id: "low", button: "LK", level: "low" };
const lethal: MoveDefinition = { ...jab, id: "lethal", button: "HP", damage: 120, chipDamage: 0 };
const neutral: InputFrame = NEUTRAL_INPUT;
const press = (button: "LP" | "LK" | "HP"): InputFrame => ({ ...neutral, attacks: [button] });
const backward: InputFrame = { ...neutral, horizontal: 1 };
const crouchBlock: InputFrame = { ...backward, vertical: -1 };

function fixture(): MatchDefinition {
  const f = (id: string) => ({
    id, maxHealth: 100, walkSpeedMmPerTick: 100,
    jumpSpeedMmPerTick: 180, gravityMmPerTick2: 20,
    pushboxHalfWidthMm: 150, moves: [jab, low, lethal],
  });
  return { fighters: [f("a"), f("b")], stage: { leftMm: -4000, rightMm: 4000, spawnDistanceMm: 800 } };
}
function step(state: MatchState, a: InputFrame = neutral, b: InputFrame = neutral, def = fixture()) {
  return stepMatch(state, [a, b], def);
}

test("uses a fixed 60 Hz tick and validates fighting definitions", () => {
  assert.equal(TICKS_PER_SECOND, 60);
  const def = fixture();
  validateMatchDefinition(def);
  assert.throws(() => validateMatchDefinition({ ...def, fighters: [def.fighters[0], def.fighters[0]] }), /distinct/);
  assert.throws(() => validateMatchDefinition({ ...def, stage: { ...def.stage, rightMm: -4000 } }), /bounds/);
});

test("spawns facing each other and never mutates previous state", () => {
  const state = createMatch(fixture());
  const previous = structuredClone(state);
  const { state: next } = step(state, { ...neutral, horizontal: 1 });
  assert.deepEqual(state, previous);
  assert.equal(next.tick, 1);
  assert.equal(state.fighters[0].facing, 1);
  assert.equal(state.fighters[1].facing, -1);
  assert.equal(next.fighters[0].xMm, state.fighters[0].xMm + 100);
});

test("attack has startup, hits once, and enters recovery", () => {
  let state = createMatch(fixture());
  let result = step(state, press("LP"));
  state = result.state;
  assert.equal(state.fighters[1].health, 100);
  assert.equal(state.fighters[0].action, "attack");
  assert.equal(result.events[0].type, "attack");
  result = step(state);
  state = result.state;
  assert.equal(state.fighters[1].health, 80);
  assert.equal(result.events.filter(e => e.type === "hit").length, 1);
  for (let tick = 0; tick < 7; tick++) state = step(state).state;
  assert.equal(state.fighters[1].health, 80);
  assert.equal(state.fighters[0].action, "idle");
});

test("standing back guards mid, with chip damage and blockstun", () => {
  let state = step(createMatch(fixture()), press("LP"), backward).state;
  const result = step(state, neutral, backward);
  state = result.state;
  assert.equal(state.fighters[1].health, 98);
  assert.equal(state.fighters[1].action, "blockstun");
  assert.ok(result.events.some(e => e.type === "block"));
});

test("low attacks require crouching back to guard", () => {
  let state = step(createMatch(fixture()), press("LK"), backward).state;
  state = step(state, neutral, backward).state;
  assert.equal(state.fighters[1].health, 80);
  state = step(createMatch(fixture()), press("LK"), crouchBlock).state;
  state = step(state, neutral, crouchBlock).state;
  assert.equal(state.fighters[1].health, 98);
});

test("simultaneous active hits trade in the same tick", () => {
  const started = step(createMatch(fixture()), press("LP"), press("LP")).state;
  const { state, events } = step(started);
  assert.equal(state.fighters[0].health, 80);
  assert.equal(state.fighters[1].health, 80);
  assert.equal(events.filter(e => e.type === "hit").length, 2);
});

test("pushboxes never overlap even when both walk into each other", () => {
  let state = createMatch(fixture());
  for (let i = 0; i < 20; i++) {
    state = step(state, { ...neutral, horizontal: 1 }, { ...neutral, horizontal: -1 }).state;
    assert.ok(Math.abs(state.fighters[0].xMm - state.fighters[1].xMm) >= 300);
    assert.ok(state.fighters.every(f => f.xMm >= -4000 && f.xMm <= 4000));
  }
});

test("jump lands deterministically on integer ground coordinates", () => {
  let state = step(createMatch(fixture()), { ...neutral, vertical: 1 }).state;
  assert.equal(state.fighters[0].action, "jump");
  assert.ok(state.fighters[0].yMm > 0);
  for (let tick = 0; tick < 40; tick++) state = step(state).state;
  assert.equal(state.fighters[0].yMm, 0);
  assert.equal(state.fighters[0].action, "idle");
});

test("airborne fighters above a move's max height are not hit", () => {
  const initial = createMatch(fixture());
  const airborne: MatchState = {
    ...initial,
    fighters: [initial.fighters[0], { ...initial.fighters[1], action: "jump", yMm: 800, verticalVelocityMmPerTick: 0 }],
  };
  let state = step(airborne, press("LP")).state;
  state = step(state).state;
  assert.equal(state.fighters[1].health, 100);
});

test("KO terminates a combat and freezes subsequent simulation", () => {
  let state = step(createMatch(fixture()), press("HP")).state;
  const result = step(state);
  state = result.state;
  assert.equal(state.phase, "ko");
  assert.equal(state.fighters[1].health, 0);
  assert.ok(result.events.some(e => e.type === "ko"));
  assert.equal(step(state).state, state);
});

test("stunned fighters cannot begin attacks", () => {
  let state = step(createMatch(fixture()), press("LP")).state;
  state = step(state, neutral, press("LP")).state;
  assert.notEqual(state.fighters[1].action, "attack");
  state = step(state, neutral, press("LP")).state;
  assert.notEqual(state.fighters[1].action, "attack");
});

test("replays of identical frame inputs produce byte-identical state", () => {
  const inputs: [InputFrame, InputFrame][] = [
    [{ ...neutral, horizontal: 1 }, { ...neutral, horizontal: -1 }],
    [press("LP"), press("LP")],
    [neutral, neutral],
    [neutral, neutral],
    [neutral, neutral],
    [{ ...neutral, horizontal: -1 }, backward],
  ];
  function play() {
    let state = createMatch(fixture());
    for (const [a, b] of inputs) state = step(state, a, b).state;
    return JSON.stringify(state);
  }
  assert.equal(play(), play());
});

test("facing follows spatial order even after a scripted side swap", () => {
  const initial = createMatch(fixture());
  const inverted: MatchState = {
    ...initial,
    fighters: [
      { ...initial.fighters[0], xMm: 400 },
      { ...initial.fighters[1], xMm: -400 },
    ],
  };
  const { state } = step(inverted);
  assert.equal(state.fighters[0].facing, -1);
  assert.equal(state.fighters[1].facing, 1);
});
