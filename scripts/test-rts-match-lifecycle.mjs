import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create:createWorld}=require('../docs/rts-world-state.js');
const {create:createResources}=require('../docs/rts-match-state.js');
const {create:createSession}=require('../docs/rts-session-state.js');
const {create:createInteraction}=require('../docs/rts-player-interaction.js');

const world=createWorld(),resources=createResources({gold:{witch:2000,orc:900},
  wood:{witch:250,orc:350},magic:{witch:0,orc:0}});
const sessionOwner=createSession(),session=sessionOwner.state;
const interaction=createInteraction();
const initial={id:'orc-barrack-initial',initial:true},orders=[];
world.buildingInstances.set(initial.id,initial);
const references={units:world.units,selected:world.selected,
  buildings:world.buildingInstances,pending:world.pendingBuilds,
  witchMemory:world.knownEnemyBuildings.witch,
  orcMemory:world.knownEnemyBuildings.orc,state:session};

// Services constructed once at boot must read the currently active treasury,
// never an old gold/wood object that resetEconomy has since replaced.
const service={getGold:()=>resources.gold,getWood:()=>resources.wood,
  getMagic:()=>resources.magic,actors:world.units,
  selected:world.selected,buildings:world.buildingInstances,
  pending:world.pendingBuilds,known:world.knownEnemyBuildings};

function beginAnotherMatch(faction,number){
  session.chosenFaction=faction;
  const oldGold=resources.gold,oldWood=resources.wood,oldMagic=resources.magic;
  const events=[];
  // Same phase boundaries as game.js, with stand-ins for renderer disposal.
  events.push('clear visual effects');
  resources.resetMagic();
  sessionOwner.resetSpells();
  for(const actor of world.units){
    assert(world.units.includes(actor));
    events.push('dispose actor '+actor.id);
  }
  world.resetActors();interaction.reset();sessionOwner.resetActors();
  events.push('reset actors');
  for(const job of world.pendingBuilds){
    assert(world.pendingBuilds.includes(job));
    events.push('dispose preview '+job.id);
  }
  world.resetConstruction();
  events.push('reset pending');
  world.removeConstructedBuildings(building=>{
    assert(world.buildingInstances.has(building.id),'building must exist during disposal');
    events.push('dispose building '+building.id);
  });
  events.push('reset buildings');
  resources.resetEconomy();
  sessionOwner.resetAudio();sessionOwner.resetFarming();
  sessionOwner.resetConstruction();sessionOwner.resetOrcSpawn();
  world.resetVisibility();sessionOwner.resetVisibility();
  sessionOwner.resetStrategy();sessionOwner.resetPassive();sessionOwner.resetMining();
  events.push('reset fog/economy');
  sessionOwner.beginMatch();
  events.push('begin match');
  assert.deepEqual(events,[
    'clear visual effects',...orders.map(o=>'dispose actor '+o.actor),
    'reset actors',...orders.map(o=>'dispose preview '+o.preview),
    'reset pending',...orders.map(o=>'dispose building '+o.building),
    'reset buildings','reset fog/economy','begin match'
  ]);

  for(const [name,expected] of Object.entries(references)){
    const value=name==='witchMemory'?world.knownEnemyBuildings.witch:
      name==='orcMemory'?world.knownEnemyBuildings.orc:
      name==='buildings'?world.buildingInstances:
      name==='pending'?world.pendingBuilds:
      name==='state'?session:world[name];
    assert.strictEqual(value,expected,`${name} must keep its identity after match ${number}`);
  }
  assert.strictEqual(service.actors,world.units);
  assert.strictEqual(service.selected,world.selected);
  assert.strictEqual(service.buildings,world.buildingInstances);
  assert.strictEqual(service.pending,world.pendingBuilds);
  assert.strictEqual(service.known,world.knownEnemyBuildings);
  assert.notStrictEqual(service.getGold(),oldGold);
  assert.notStrictEqual(service.getWood(),oldWood);
  assert.notStrictEqual(service.getMagic(),oldMagic);
  assert.deepEqual(service.getGold(),{witch:2000,orc:900});
  assert.deepEqual(service.getWood(),{witch:250,orc:350});
  assert.deepEqual(service.getMagic(),{witch:0,orc:0});
  assert.equal(session.activeFaction,faction);
  assert.equal(session.running,true);
  assert.equal(session.paused,false);
  assert.equal(session.nextUnitId,1);
  assert.equal(session.completedMiningCycles,0);
  assert.equal(world.units.length,0);
  assert.equal(world.pendingBuilds.length,0);
  assert.deepEqual([...world.buildingInstances.values()],[initial]);
  assert.equal(world.selected.size,0);
  assert.equal(world.knownEnemyBuildings.witch.size,0);
  assert.equal(world.knownEnemyBuildings.orc.size,0);
  assert.equal(interaction.selectedBuilding,null);
  assert.equal(interaction.selectedRaven,null);
  assert.equal(interaction.attackMode,false);
  assert.equal(interaction.buildMode,null);
  orders.length=0;
  return {oldGold,oldWood,oldMagic};
}

for(const [index,faction] of ['witch','orc','witch'].entries()){
  const round=index+1;
  // Each round intentionally dirties every registry and each resource pool.
  const actor={id:round},job={id:round},building={id:'new-'+round,initial:false};
  world.units.push(actor);world.selected.add(actor);
  world.pendingBuilds.push(job);
  world.buildingInstances.set(building.id,building);
  world.knownEnemyBuildings.witch.add(building.id);
  world.knownEnemyBuildings.orc.add('witch-house-01');
  orders.push({actor:actor.id,preview:job.id,building:building.id});
  service.getGold().witch-=100+round;
  service.getWood().orc-=20+round;
  service.getMagic().witch=round*25;
  session.nextUnitId=40+round;session.completedMiningCycles=round;
  interaction.selectBuilding(building);interaction.beginAttack();
  interaction.beginBuild('garden');
  session.paused=true;
  sessionOwner.endMatch();
  assert.equal(session.running,false,`match ${round} must have ended`);
  const old=beginAnotherMatch(faction,round);
  assert.equal(old.oldGold.witch,2000-100-round,
    'the old treasury stays detached after match restart');
  assert.equal(old.oldWood.orc,350-20-round);
  assert.equal(old.oldMagic.witch,round*25);
}

// Regression guard against casually replacing a stable registry or changing
// the disposal-before-drop order in the actual Three.js composition root.
const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const start=game.slice(game.indexOf('function startSession(){'),
  game.indexOf('function unitFaction(',game.indexOf('function startSession(){')));
const boundaries=[
  'clearOrderPings();clearBolts();clearWitchDome();clearFireRain()',
  'matchResources.resetMagic()',
  'for(const actor of units)releaseActor(actor)',
  'matchWorld.resetActors()',
  'for(const job of pendingBuilds)disposeConstructionPreview(job)',
  'matchWorld.resetConstruction()',
  'matchWorld.removeConstructedBuildings(releaseConstructedBuilding)',
  'matchResources.resetEconomy()',
  'fogOfWar.reset();matchWorld.resetVisibility()',
  'sessionOwner.beginMatch()',
  "spawnUnit('witch'"
];
let previous=-1;
for(const boundary of boundaries){
  const current=start.indexOf(boundary);
  assert(current>previous,`${boundary} must follow earlier reset phases`);
  previous=current;
}
assert(game.includes('sessionOwner.endMatch()'),
  'endBattle must transition the session through its owner');
for(const deprecated of ['units.length=0;selected.clear()',
  'pendingBuilds.length=0','knownEnemyBuildings.witch.clear()',
  'knownEnemyBuildings.orc.clear()']){
  assert(!start.includes(deprecated),`${deprecated} bypasses the world owner`);
}
assert(game.includes('getGold:()=>matchResources.gold,getWood:()=>matchResources.wood'),
  'orders must read the current resource objects, not retain a snapshot');
console.log('PASS three matches: disposal order, end/start transitions, stable registries and fresh resources');
