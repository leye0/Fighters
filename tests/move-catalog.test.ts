import test from "node:test";
import assert from "node:assert/strict";
import { MOVE_CATALOG } from "../src/game/move-catalog.ts";
import { fighterDefinition } from "../src/game/roster-config.ts";
import {
  createMatch, stepMatch, NEUTRAL_INPUT, type MatchDefinition,
  type MatchState, type InputFrame, type MoveDefinition,
} from "../src/engine/simulation.ts";
import { MOTIONS } from "../src/engine/commands.ts";

const basic = NEUTRAL_INPUT;
const input = (h: -1|0|1, v: -1|0|1, attacks: InputFrame["attacks"] = []): InputFrame =>
  ({ horizontal:h, vertical:v, attacks });
const game = (distance=900): MatchDefinition => ({
  stage: {leftMm:-5000,rightMm:5000,spawnDistanceMm:distance},
  fighters:[fighterDefinition("p1"),fighterDefinition("p2")],
});
const tick = (state:MatchState, a:InputFrame=basic, definition=game()) =>
  stepMatch(state,[a,basic],definition);
const fromCode=(code:number,button: InputFrame["attacks"]=[]):InputFrame =>
  input((((code-1)%3)-1) as -1|0|1,(code<=3?-1:code>=7?1:0) as -1|0|1,button);
const motion=(pattern:readonly number[],button:InputFrame["attacks"],definition=game())=>{
  let state=createMatch(definition);
  for(let i=0;i<pattern.length;i++)state=tick(state,fromCode(pattern[i],i===pattern.length-1?button:[]),definition).state;
  return state;
};

test("seventy-one individually identified arcade attacks have animation roles and valid frame data", () => {
  assert.equal(MOVE_CATALOG.length,71);
  assert.equal(new Set(MOVE_CATALOG.map(move=>move.id)).size,71);
  assert.ok(MOVE_CATALOG.every(move=>(move.animationRole?.length ?? 0)>0));
  assert.ok(MOVE_CATALOG.some(move=>move.stance==="airborne"));
  assert.ok(MOVE_CATALOG.some(move=>move.stance==="crouching"));
  assert.ok(MOVE_CATALOG.some(move=>move.buttons?.length>=2));
  assert.ok(MOVE_CATALOG.some(move=>move.motion==="full-circle"));
  assert.doesNotThrow(()=>createMatch(game()));
});

test("down + LP selects crouch-jab, while neutral + LP selects jab", () => {
  assert.equal(tick(createMatch(game()),input(0,-1,["LP"])).state.fighters[0].moveId,"crouch-jab");
  assert.equal(tick(createMatch(game()),input(0,0,["LP"])).state.fighters[0].moveId,"jab");
});

test("forward + MP selects elbow-drive and backward + HP selects backfist", () => {
  assert.equal(tick(createMatch(game()),input(1,0,["MP"])).state.fighters[0].moveId,"elbow-drive");
  assert.equal(tick(createMatch(game()),input(-1,0,["HP"])).state.fighters[0].moveId,"backfist");
});

test("simultaneous attack buttons select dedicated chord moves", () => {
  assert.equal(tick(createMatch(game()),input(0,0,["LP","LK"])).state.fighters[0].moveId,"palm-and-knee");
  assert.equal(tick(createMatch(game()),input(0,0,["MP","MK"])).state.fighters[0].moveId,"hammer-combination");
  assert.equal(tick(createMatch(game()),input(0,0,["LP","HP","HK"])).state.fighters[0].moveId,"heavy-breaker");
});

test("QCB, HCF and practical 360 shortcut all select distinct special moves", () => {
  assert.equal(motion(MOTIONS["quarter-circle-back"],["HK"]).fighters[0].moveId,"retreat-spin");
  assert.equal(motion(MOTIONS["half-circle-forward"],["HP"]).fighters[0].moveId,"rolling-crush");
  assert.equal(motion(MOTIONS["full-circle"],["HK"]).fighters[0].moveId,"ring-of-fire");
});

test("jumps permit distinct airborne normals while keeping integer gravity active", () => {
  let state=tick(createMatch(game()),input(0,1)).state;
  assert.equal(state.fighters[0].action,"jump");
  state=tick(state,input(0,0,["MP"])).state;
  assert.equal(state.fighters[0].moveId,"air-cross");
  assert.ok(state.fighters[0].yMm>0);
  for(let i=0;i<50;i++) state=tick(state).state;
  assert.equal(state.fighters[0].yMm,0);
  assert.equal(state.fighters[0].action,"idle");
});

test("airborne attacks cannot reach targets beyond their vertical hit envelope", () => {
  const d=game();
  const modified = d.fighters[0].moves.map(move=>move.id==="air-cross"
    ? {...move,maxVerticalSeparationMm:100} : move);
  const restricted: MatchDefinition={...d,fighters:[{...d.fighters[0],moves:modified},d.fighters[1]]};
  let state=tick(createMatch(restricted),input(0,1),restricted).state;
  state=tick(state,input(0,0,["MP"]),restricted).state;
  for(let i=0;i<9;i++)state=tick(state,basic,restricted).state;
  assert.equal(state.fighters[1].health,100);
});

test("hit-confirmed jab can cancel into straight with two separate attacks", () => {
  let state=tick(createMatch(game()),input(0,0,["LP"])).state;
  for(let i=0;i<4;i++) state=tick(state).state;
  assert.equal(state.fighters[0].moveHitOpponent,true);
  const result=tick(state,input(0,0,["MP"]));
  assert.equal(result.state.fighters[0].moveId,"straight");
  assert.equal(result.state.fighters[0].moveFrame,0);
  assert.ok(result.events.some(e=>e.type==="cancel" && e.fromMoveId==="jab" && e.toMoveId==="straight"));
});

test("a whiff cannot cancel; unrelated moves cannot bypass an authored cancel list", () => {
  let state=tick(createMatch(game(2800)),input(0,0,["LP"]),game(2800)).state;
  for(let i=0;i<4;i++)state=tick(state,basic,game(2800)).state;
  assert.equal(state.fighters[0].moveHitOpponent,false);
  assert.equal(tick(state,input(0,0,["MP"]),game(2800)).state.fighters[0].moveId,"jab");
  state=tick(createMatch(game()),input(0,0,["LP"])).state;
  for(let i=0;i<4;i++)state=tick(state).state;
  assert.equal(tick(state,input(0,0,["HK"])).state.fighters[0].moveId,"jab");
});

test("invalid chord, cancel link and clip role are rejected", () => {
  const d=game();
  const altered=(move:MoveDefinition):MatchDefinition => ({...d,fighters:[
    {...d.fighters[0],moves:[...d.fighters[0].moves,{...move,id:"invalid-move"}]},
    d.fighters[1],
  ]});
  assert.throws(()=>createMatch(altered({...MOVE_CATALOG[0],buttons:["LP","LP"]})),/button chord/);
  assert.throws(()=>createMatch(altered({...MOVE_CATALOG[0],cancelInto:["does-not-exist"]})),/cancel destination/);
  assert.throws(()=>createMatch(altered({...MOVE_CATALOG[0],animationRole:""})),/animation role/);
  assert.throws(()=>createMatch(altered({...MOVE_CATALOG[0],stance:"flying" as never})),/stance/);
  assert.throws(()=>createMatch(altered({...MOVE_CATALOG[0],cancelFromTick:999,cancelThroughTick:undefined})),/cancel start/);
});
