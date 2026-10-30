import test from "node:test";
import assert from "node:assert/strict";
import { MOVE_CATALOG } from "../src/game/move-catalog.ts";
import { moveCategory, moveCommand } from "../src/game/command-guide.ts";

const move=(id:string)=>MOVE_CATALOG.find(item=>item.id===id)!;
test("normal, crouching, aerial and directional attacks have readable commands", () => {
  assert.equal(moveCommand(move("jab")),"LP");
  assert.equal(moveCommand(move("crouch-jab")),"↓ + LP");
  assert.equal(moveCommand(move("air-cross")),"AIR + MP");
  assert.equal(moveCommand(move("elbow-drive")),"→ + MP");
  assert.equal(moveCommand(move("backfist")),"← + HP");
});

test("motion specials and multi-button chords are explained without asset claims", () => {
  assert.equal(moveCommand(move("surge-punch")),"↓ ↘ → + MP");
  assert.equal(moveCommand(move("rising-uppercut")),"→ ↓ ↘ + HP");
  assert.equal(moveCommand(move("ring-of-fire")),"→ ↘ ↓ ↙ ← ↖ + HK");
  assert.equal(moveCommand(move("palm-and-knee")),"LP + LK");
});

test("all moves can be classified and represented as commands", () => {
  for(const item of MOVE_CATALOG) {
    assert.ok(moveCommand(item).length>0,item.id);
    assert.ok(moveCategory(item).length>0,item.id);
  }
  assert.equal(moveCategory(move("meteor-fist")),"Super");
  assert.equal(moveCategory(move("crouch-cross")),"Accroupi");
});
