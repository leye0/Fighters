import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../app/rts-session-state.js');
const owner=create(),state=owner.state;

assert.deepEqual(state,{
  running:false,paused:false,activeFaction:'witch',chosenFaction:'witch',
  nextUnitId:1,orcSpawned:false,qaPassiveKind:null,
  farmSerial:0,stoneCircleSerial:0,wallSerial:0,
  orcIncomeFraction:0,strategyAccumulator:0,witchStrategyAccumulator:0,
  completedMiningCycles:0,totalMinedGold:0,
  spellDecisionElapsed:0,fogElapsed:0,fogStarted:false,
  lastOrcAiVoice:-Infinity
});

// A first match evolves all the independently scheduled mutable counters.
state.chosenFaction='orc';owner.beginMatch();
assert.equal(state.activeFaction,'orc');
state.paused=true;state.nextUnitId=19;state.orcSpawned=true;
state.qaPassiveKind='witch';state.farmSerial=6;state.stoneCircleSerial=2;
state.wallSerial=7;state.orcIncomeFraction=.5;state.strategyAccumulator=.26;
state.witchStrategyAccumulator=.13;state.completedMiningCycles=4;
state.totalMinedGold=78;state.spellDecisionElapsed=1.7;
state.fogElapsed=.1;state.fogStarted=true;state.lastOrcAiVoice=4000;
owner.endMatch();
assert.equal(state.running,false,'finished matches stop the simulation');
assert.equal(state.paused,true,'ending preserves the historical paused flag');

// Named boundaries are individually observable: the game calls each one
// at the original point in the 3D reset, not in one eager global reset.
const stable=state;
owner.resetAudio();
assert.equal(state.lastOrcAiVoice,-Infinity);
assert.equal(state.spellDecisionElapsed,1.7);
owner.resetSpells();
assert.equal(state.spellDecisionElapsed,0);
assert.equal(state.nextUnitId,19);
owner.resetActors();
assert.equal(state.nextUnitId,1);
assert.equal(state.wallSerial,7);
owner.resetFarming();
assert.equal(state.farmSerial,0);
owner.resetConstruction();
assert.equal(state.stoneCircleSerial,0);
assert.equal(state.wallSerial,0);
assert.equal(state.orcSpawned,true);
owner.resetOrcSpawn();
assert.equal(state.orcSpawned,false);
owner.resetVisibility();
assert.equal(state.fogElapsed,0);
assert.equal(state.fogStarted,true);
assert.equal(state.strategyAccumulator,.26);
owner.resetStrategy();
assert.equal(state.orcIncomeFraction,0);
assert.equal(state.strategyAccumulator,0);
assert.equal(state.witchStrategyAccumulator,0);
owner.resetPassive();
assert.equal(state.qaPassiveKind,null);
owner.resetMining();
assert.equal(state.completedMiningCycles,0);
assert.equal(state.totalMinedGold,0);
assert.equal(state.running,false,'cleanup preserves the previous end-of-battle state');
assert.equal(state.paused,true,'cleanup does not resume before match begins');
owner.beginMatch();
assert.equal(state.activeFaction,'orc');
assert.equal(state.paused,false);
owner.endMatch();
assert.equal(state.running,false);
owner.beginMatch();
assert.equal(state.running,true,'a finished match may start again');
assert.equal(state.running,true);
assert.equal(state,stable,'services keep a stable state identity across resets');

// A second match can choose the other clan with no old counters or status.
state.chosenFaction='witch';state.paused=true;state.nextUnitId=42;
owner.resetAudio();owner.resetSpells();owner.resetActors();owner.resetFarming();
owner.resetConstruction();owner.resetOrcSpawn();owner.resetVisibility();
owner.resetStrategy();owner.resetPassive();owner.resetMining();owner.beginMatch();
assert.equal(state.activeFaction,'witch');
assert.equal(state.nextUnitId,1);
assert.equal(state.strategyAccumulator,0);
assert.equal(state.completedMiningCycles,0);
assert.equal(state.paused,false);

const another=create();
assert.notEqual(another.state,state,'different games cannot share scalar owners');
state.lastOrcAiVoice=55;state.nextUnitId=2;state.running=false;
owner.reset();
assert.equal(owner.state,stable,'full reset preserves the stable object identity');
assert.deepEqual(owner.state,another.state,
  'full reset restores exactly the initial values without touching another game');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersSessionState.create()'));
assert(game.includes('sessionOwner.beginMatch()'));
assert(game.includes('sessionOwner.endMatch()'));
for(const method of ['resetAudio','resetSpells','resetActors','resetFarming',
  'resetConstruction','resetOrcSpawn','resetVisibility','resetStrategy',
  'resetPassive','resetMining']){
  assert(game.includes(`sessionOwner.${method}()`),`game reset must call ${method}`);
}
for(const scalar of Object.keys(state)){
  assert(!new RegExp(`\\b(?:let|var)\\s+${scalar}\\b`).test(game),
    `${scalar} must no longer be a loose mutable session variable`);
}
console.log('PASS stable session owner, phased cleanup, two matches, counters and faction changes');
