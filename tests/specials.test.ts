import test from "node:test";
import assert from "node:assert/strict";
import {
  createMatch, stepMatch, NEUTRAL_INPUT, INPUT_HISTORY_TICKS,
  type FighterDefinition, type InputFrame, type MatchDefinition, type MatchState,
} from "../src/engine/simulation.ts";
import { fighterDefinition } from "../src/game/roster-config.ts";

const neutral = NEUTRAL_INPUT;
const key = (horizontal: -1 | 0 | 1, vertical: -1 | 0 | 1, attacks: InputFrame["attacks"] = []): InputFrame =>
  ({ horizontal, vertical, attacks });
const down = key(0, -1), downForward = key(1, -1), forward = key(1, 0);
const special = key(1, 0, ["MP"]);
const fixture = (): MatchDefinition => ({
  stage: { leftMm:-4000, rightMm:4000, spawnDistanceMm:2200 },
  fighters: [fighterDefinition("alpha"), fighterDefinition("beta")],
});
const advance = (state: MatchState, a: InputFrame = neutral, b: InputFrame = neutral, definition=fixture()) =>
  stepMatch(state, [a, b], definition);

test("ordinary punches remain available without motion", () => {
  const next = advance(createMatch(fixture()), key(0,0,["MP"])).state;
  assert.equal(next.fighters[0].moveId, "straight");
});
test("quarter-circle forward + MP triggers its special instead of the normal", () => {
  let state=createMatch(fixture());
  state=advance(state, down).state;
  state=advance(state, downForward).state;
  const before=structuredClone(state);
  const result=advance(state, special);
  assert.equal(result.state.fighters[0].moveId,"surge-punch");
  assert.ok(result.events.some(event=>event.type==="attack" && event.moveId==="surge-punch"));
  assert.deepEqual(state,before,"the previous frame and motion history must not mutate");
});
test("motions are relative to facing, including for player two", () => {
  let state=createMatch(fixture());
  state=advance(state,neutral,down).state;
  state=advance(state,neutral,key(-1,-1)).state;
  state=advance(state,neutral,key(-1,0,["MP"])).state;
  assert.equal(state.fighters[1].moveId,"surge-punch");
});
test("wrong direction order does not activate the special", () => {
  let state=createMatch(fixture());
  state=advance(state,forward).state;
  state=advance(state,downForward).state;
  state=advance(state,key(0,-1,["MP"])).state;
  assert.equal(state.fighters[0].moveId,"crouch-cross");
});
test("holding final direction does not refresh an expired motion", () => {
  let state=createMatch(fixture());
  state=advance(state,down).state;
  state=advance(state,downForward).state;
  state=advance(state,forward).state;
  for(let i=0;i<6;i++) state=advance(state,forward).state;
  state=advance(state,special).state;
  assert.equal(state.fighters[0].moveId,"elbow-drive");
});
test("dragon-punch command with HP triggers uppercut", () => {
  let state=createMatch(fixture());
  state=advance(state,forward).state;
  state=advance(state,down).state;
  state=advance(state,key(1,-1,["HP"])).state;
  assert.equal(state.fighters[0].moveId,"rising-uppercut");
});
test("longer double-quarter-circle command wins over a basic quarter-circle", () => {
  const def=fixture();
  const augmented: FighterDefinition={...def.fighters[0],moves:[
    ...def.fighters[0].moves.filter(move => move.id !== "meteor-fist"),
    {...def.fighters[0].moves.find(move=>move.id==="surge-punch")!,
      id:"double-surge",motion:"double-quarter-circle-forward" as const,commandPriority:0},
  ]};
  const game: MatchDefinition={...def,fighters:[augmented,def.fighters[1]]};
  let state=createMatch(game);
  for(const input of [down,downForward,forward,down,downForward,special]) {
    state=advance(state,input,neutral,game).state;
  }
  assert.equal(state.fighters[0].moveId,"double-surge");
});
test("side swaps clear facing-relative command histories", () => {
  let state=createMatch(fixture());
  state=advance(state,down).state;
  assert.ok(state.inputHistory[0].length>0);
  const inverted: MatchState={...state,fighters:[
    {...state.fighters[0],xMm:700},
    {...state.fighters[1],xMm:-700},
  ]};
  const after=advance(inverted).state;
  assert.equal(after.fighters[0].facing,-1);
  assert.deepEqual(after.inputHistory,[[],[]]);
});
test("input histories are bounded, deterministic and serializable for replay", () => {
  const sequence=Array.from({length:120},(_,i)=>key(i%2?1:-1,0));
  const play=()=>{
    let state=createMatch(fixture());
    for(const frame of sequence) {
      state=advance(state,frame).state;
      assert.ok(state.inputHistory[0].length<=INPUT_HISTORY_TICKS+1);
    }
    return JSON.stringify(state);
  };
  assert.equal(play(),play());
});
test("unknown motions and invalid command priorities are rejected", () => {
  const def=fixture();
  const first=def.fighters[0];
  assert.throws(()=>createMatch({...def,fighters:[{
    ...first,moves:[...first.moves,{...first.moves[0],id:"bad",motion:"teleport" as never}],
  },def.fighters[1]]}),/Unknown motion/);
  assert.throws(()=>createMatch({...def,fighters:[{
    ...first,moves:[...first.moves,{...first.moves[0],id:"bad",commandPriority:-1}],
  },def.fighters[1]]}),/commandPriority/);
});
