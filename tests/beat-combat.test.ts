import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DEMO_ATTACKS, createBeatCombat, isWithinAttackVolume,
  stepBeatCombat, type BeatCombatInput, type BeatCombatState,
} from "../src/engine/beat-combat.ts";
import { demoEnemyCombatInputs } from "../src/game/beat-enemy-ai.ts";
import { DIAGNOSTIC_ACTORS, DIAGNOSTIC_STAGE } from "../src/game/beat-stage.ts";

const neutral: BeatCombatInput = { movement: { horizontal: 0, depth: 0, jump: false } };
const attack = (name: "jab" | "cross" | "hook"): BeatCombatInput =>
  ({ ...neutral, attack: name });
function tick(state: BeatCombatState, command: BeatCombatInput = neutral): BeatCombatState {
  return stepBeatCombat(state, { hero: command }, DIAGNOSTIC_STAGE);
}
function advance(state: BeatCombatState, ticks: number): BeatCombatState {
  for (let t = 0; t < ticks; t++) state = tick(state);
  return state;
}

test("a real authored jab damages only the facing, depth-aligned enemy once", () => {
  let game = createBeatCombat(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS);
  game = tick(game, attack("jab"));
  assert.deepEqual(game.events, [{ kind: "attack", actorId: "hero", attack: "jab" }]);
  game = advance(game, DEMO_ATTACKS.jab.contactFrom - 1);
  assert.equal(game.fighters["enemy-a"].health, 44);
  game = tick(game);
  assert.equal(game.fighters["enemy-a"].health, 32);
  assert.equal(game.fighters["enemy-b"].health, 44, "enemy behind facing stays unharmed");
  assert.deepEqual(game.events.filter(e => e.kind === "hit").map(e => e.actorId), ["enemy-a"]);
  game = advance(game, 35);
  assert.equal(game.fighters["enemy-a"].health, 32, "one strike cannot hit the same enemy twice");
  assert.equal(game.world.actors[0].facing, 1, "targeting never rotates the heroine");
  assert.equal(game.world.actors[1].xMm, -10100, "no knockback/pushbox added");
});

test("three authored cross hits KO an enemy and end a one-enemy round", () => {
  let game = createBeatCombat(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS.slice(0, 2));
  for (let i = 0; i < 3; i++) {
    game = tick(game, attack("cross"));
    game = advance(game, DEMO_ATTACKS.cross.totalTicks);
  }
  assert.equal(game.fighters["enemy-a"].health, 0);
  assert.equal(game.world.actors[1].alive, false);
  assert.equal(game.outcome, "victory");
  assert.deepEqual(tick(game).world, game.world, "terminal round is frozen");
});

test("contact volumes use facing, lateral depth and actual platform height", () => {
  const [hero, enemy] = DIAGNOSTIC_ACTORS;
  assert.equal(isWithinAttackVolume(hero, enemy, "jab"), true);
  assert.equal(isWithinAttackVolume({ ...hero, facing: -1 }, enemy, "jab"), false);
  assert.equal(isWithinAttackVolume(hero, { ...enemy, depthMm: 1000 }, "jab"), false);
  assert.equal(isWithinAttackVolume(hero, { ...enemy, heightMm: 1500 }, "jab"), false);
  assert.equal(isWithinAttackVolume(hero, { ...enemy, xMm: -9000 }, "jab"), false);
  assert.equal(isWithinAttackVolume(hero, { ...enemy, team: hero.team }, "jab"), false);
});

test("simultaneous attacks trade symmetrically and interrupt both strikes", () => {
  let game = createBeatCombat(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS.slice(0, 2));
  game = stepBeatCombat(game, { hero: attack("jab"), "enemy-a": attack("jab") }, DIAGNOSTIC_STAGE);
  for (let i = 0; i < DEMO_ATTACKS.jab.contactFrom; i++) game = stepBeatCombat(game, {}, DIAGNOSTIC_STAGE);
  assert.equal(game.fighters.hero.health, 88);
  assert.equal(game.fighters["enemy-a"].health, 32);
  assert.equal(game.fighters.hero.attack, null);
  assert.equal(game.fighters["enemy-a"].attack, null);
  assert.equal(game.events.filter(e => e.kind === "hit").length, 2);
  const after = tick(game, attack("cross"));
  assert.equal(after.fighters.hero.attack, null, "hitstun prevents immediate counterattack");
});

test("both enemies autonomously face by movement and author real jab requests", () => {
  let game = createBeatCombat(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS);
  let attacks = 0;
  for (let t = 0; t < 240; t++) {
    game = stepBeatCombat(game, demoEnemyCombatInputs(game, DIAGNOSTIC_STAGE), DIAGNOSTIC_STAGE);
    attacks += game.events.filter(e => e.kind === "attack").length;
  }
  assert.ok(attacks >= 1, "hostile AI must eventually throw a real attack");
  assert.ok(game.fighters.hero.health < 100, "enemy blows can actually damage the hero");
});

test("identical combat inputs replay byte-for-byte at 60 Hz", () => {
  const play = () => {
    let game = createBeatCombat(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS);
    for (let i = 0; i < 210; i++) {
      const hero = i % 90 === 0 ? attack("jab") : {
        movement: { horizontal: (i % 80 < 20 ? 1 : 0) as 0 | 1, depth: 0 as const, jump: false },
      };
      game = stepBeatCombat(game, { ...demoEnemyCombatInputs(game, DIAGNOSTIC_STAGE),
        hero }, DIAGNOSTIC_STAGE);
    }
    return game;
  };
  assert.deepEqual(play(), play());
});

test("all demo attack durations are measured from the actual published CC0 GLB", async () => {
  const binary = await readFile(new URL("../public/models/claudia.glb", import.meta.url));
  assert.equal(binary.toString("ascii", 0, 4), "glTF");
  const jsonLength = binary.readUInt32LE(12);
  const doc = JSON.parse(binary.toString("utf8", 20, 20 + jsonLength));
  for (const [kind, data] of Object.entries(DEMO_ATTACKS)) {
    const clip = doc.animations.find((a: { name: string }) => a.name === data.clip);
    assert.ok(clip, kind + ": authentic clip missing");
    const input = doc.accessors[clip.samplers[0].input];
    assert.equal(Math.round(input.max[0] * 60), data.totalTicks, kind + ": timing drift");
  }
});
