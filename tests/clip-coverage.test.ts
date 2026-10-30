import test from "node:test";
import assert from "node:assert/strict";
import { missingAnimationClipNames, REQUIRED_FIGHTER_STATES } from "../src/render/clip-coverage.ts";
import { animationBackedFighter, type AnimationInventory } from "../src/game/animation-first.ts";

const empty: AnimationInventory = {schemaVersion:1,workflow:"animation-first",clips:[]};
test("unloaded fighter must have real idle, locomotion and reaction clips",()=>{
  const missing=missingAnimationClipNames(animationBackedFighter("f1",empty),new Set());
  assert.deepEqual(missing,REQUIRED_FIGHTER_STATES);
});
test("character-specific mappings are resolved before actual clip availability check",()=>{
  const f=animationBackedFighter("f1",empty);
  const map=Object.fromEntries(REQUIRED_FIGHTER_STATES.map(key=>[key,"Actual "+key]));
  assert.deepEqual(missingAnimationClipNames(f,new Set(Object.values(map)),map),[]);
  assert.deepEqual(missingAnimationClipNames(f,new Set(["Actual idle"]),map),[
    "Actual walk","Actual jump","Actual crouch","Actual hitstun","Actual blockstun","Actual ko",
  ]);
});
test("unavailable combat clips remain blockers, never substituted",()=>{
  const f=animationBackedFighter("f1",empty);
  const augmented={...f,moves:[{
    id:"observed-punch",button:"LP" as const,animationRole:"Verified Punch",
    startupTicks:5,activeTicks:4,recoveryTicks:10,
    damage:8,chipDamage:0,rangeMm:800,maxTargetHeightMm:1600,
    level:"mid" as const,hitstunTicks:9,blockstunTicks:6,pushbackMm:90,
  }]};
  assert.deepEqual(missingAnimationClipNames(
    augmented,new Set(REQUIRED_FIGHTER_STATES),
  ),["Verified Punch"]);
  assert.deepEqual(missingAnimationClipNames(
    augmented,new Set([...REQUIRED_FIGHTER_STATES,"Real Punch"]),
    {"observed-punch":"Real Punch"},
  ),[]);
});

test("mobile layered punch requires a real backward gait; forward gait is never substituted", () => {
  const fighter = animationBackedFighter("f1", empty);
  const move = {
    id: "mobile-jab", button: "LP" as const, animationRole: "Lead_Jab_2",
    startupTicks: 5, activeTicks: 3, recoveryTicks: 11,
    damage: 8, chipDamage: 0, rangeMm: 900, maxTargetHeightMm: 1600,
    level: "mid" as const, hitstunTicks: 9, blockstunTicks: 6, pushbackMm: 90,
    animationLayer: "upperBody" as const, groundMovementPercent: 25,
  };
  const clips = new Set([...REQUIRED_FIGHTER_STATES, "Lead_Jab_2"]);
  assert.deepEqual(missingAnimationClipNames({ ...fighter, moves: [move] }, clips), ["walkBack"]);
  assert.deepEqual(missingAnimationClipNames({ ...fighter, moves: [move] },
    new Set([...clips, "Step_Backward_3"]), { walkBack: "Step_Backward_3" }), []);
  assert.deepEqual(missingAnimationClipNames({ ...fighter, moves: [{ ...move, groundMovementPercent: 0 }] }, clips), []);
});
