import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDigitalInput, directionCode, matchesMotion, MOTIONS, type DigitalInput } from "../src/engine/commands.ts";
import type { InputFrame } from "../src/engine/simulation.ts";

const empty: DigitalInput = {
  left:false,right:false,up:false,down:false,LP:false,MP:false,HP:false,LK:false,MK:false,HK:false,
};
test("pressed buttons are edges, not repeated while held", () => {
  const state={...empty,LP:true};
  assert.deepEqual(normalizeDigitalInput(state,empty).attacks,["LP"]);
  assert.deepEqual(normalizeDigitalInput(state,state).attacks,[]);
});
test("opposite direction inputs cancel cleanly", () => {
  assert.equal(normalizeDigitalInput({...empty,left:true,right:true},empty).horizontal,0);
  assert.equal(normalizeDigitalInput({...empty,up:true,down:true},empty).vertical,0);
});
test("numpad directions flip with facing", () => {
  const front: InputFrame={horizontal:1,vertical:-1,attacks:[]};
  assert.equal(directionCode(front,1),3);
  assert.equal(directionCode(front,-1),1);
  assert.equal(directionCode({horizontal:0,vertical:0,attacks:[]},1),5);
  assert.equal(directionCode({horizontal:0,vertical:1,attacks:[]},1),8);
});
test("quarter-circle motion accepts held frames and extra intermediates", () => {
  const history=[
    {tick:1,direction:2 as const},{tick:2,direction:2 as const},
    {tick:3,direction:3 as const},{tick:4,direction:3 as const},
    {tick:5,direction:6 as const},
  ];
  assert.equal(matchesMotion(history,MOTIONS["quarter-circle-forward"],5),true);
  assert.equal(matchesMotion(history,MOTIONS["quarter-circle-forward"],12),false);
  assert.equal(matchesMotion(history,MOTIONS["quarter-circle-back"],5),false);
});
test("motion matching rejects wrong ordering or expired input", () => {
  assert.equal(matchesMotion([{tick:1,direction:6},{tick:2,direction:3},{tick:3,direction:2}],MOTIONS["quarter-circle-forward"],3),false);
  assert.equal(matchesMotion([{tick:1,direction:2},{tick:2,direction:3},{tick:3,direction:6}],MOTIONS["quarter-circle-forward"],24),false);
  assert.equal(matchesMotion([{tick:2,direction:2},{tick:1,direction:3},{tick:3,direction:6}],MOTIONS["quarter-circle-forward"],3),false);
});
test("double quarter-circle cannot match a single quarter-circle", () => {
  const one=[{tick:1,direction:2 as const},{tick:2,direction:3 as const},{tick:3,direction:6 as const}];
  const two=[...one,{tick:4,direction:2 as const},{tick:5,direction:3 as const},{tick:6,direction:6 as const}];
  assert.equal(matchesMotion(one,MOTIONS["double-quarter-circle-forward"],3),false);
  assert.equal(matchesMotion(two,MOTIONS["double-quarter-circle-forward"],6),true);
});
