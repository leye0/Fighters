import test from "node:test";
import assert from "node:assert/strict";
import { createMatch } from "../src/engine/simulation.ts";
import { fighterDefinition, DEFAULT_STAGE } from "../src/game/roster-config.ts";
import { animationClipName } from "../src/render/animation-map.ts";

const definition = fighterDefinition("fighter");
const fighter = createMatch({
  stage: DEFAULT_STAGE,
  fighters: [definition, fighterDefinition("other")],
}).fighters[0];

test("move IDs resolve to semantic animation roles without claiming clips exist", () => {
  const attacking = {...fighter,action:"attack" as const,moveId:"surge-punch"};
  assert.equal(animationClipName(attacking,definition),"cross");
  assert.equal(animationClipName({...attacking,moveId:"ring-of-fire"},definition),"spinning_kick");
});

test("character clip mapping takes precedence by exact move, then common role", () => {
  const attacking = {...fighter,action:"attack" as const,moveId:"surge-punch"};
  const map={cross:"Mixamo Punch", "surge-punch":"Fighter Special"};
  assert.equal(animationClipName(attacking,definition,map),"Fighter Special");
  assert.equal(animationClipName(attacking,definition,{cross:"Mixamo Punch"}),"Mixamo Punch");
});

test("locomotion clips can be mapped separately from attack roles", () => {
  assert.equal(animationClipName(fighter,definition,{idle:"Combat Idle"}),"Combat Idle");
  assert.equal(animationClipName({...fighter,action:"jump"},definition,{jump:"Leap"}),"Leap");
});

test("unknown authored role is never disguised as another animation", () => {
  const attacking={...fighter,action:"attack" as const,moveId:"unmapped-move"};
  assert.equal(animationClipName(attacking,definition),"unmapped-move");
  assert.equal(animationClipName({...attacking,moveId:null},definition),null);
});
