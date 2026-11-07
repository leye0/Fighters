import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-world-state.js');

const world=create();
assert(Object.isFrozen(world));
assert.deepEqual(Object.keys(world),[
  'units','selected','buildingInstances','pendingBuilds','knownEnemyBuildings',
  'resetActors','resetConstruction','removeConstructedBuildings','resetVisibility'
]);
assert.deepEqual(world.units,[]);
assert(world.selected instanceof Set);
assert(world.buildingInstances instanceof Map);
assert.deepEqual(world.pendingBuilds,[]);
assert(world.knownEnemyBuildings.witch instanceof Set);
assert(world.knownEnemyBuildings.orc instanceof Set);
assert.notStrictEqual(world.knownEnemyBuildings.witch,world.knownEnemyBuildings.orc);

const worker={id:1};
const building={id:'orc-hut-01'};
const job={id:'pending-garden-01'};
const units=world.units;
const selected=world.selected;
const buildings=world.buildingInstances;
const pending=world.pendingBuilds;
const memory=world.knownEnemyBuildings;
world.units.push(worker);
world.selected.add(worker);
world.buildingInstances.set(building.id,building);
world.pendingBuilds.push(job);
world.knownEnemyBuildings.witch.add(building.id);
world.knownEnemyBuildings.orc.add('witch-house-01');
assert.strictEqual(units[0],worker);
assert.strictEqual([...selected][0],worker);
assert.strictEqual(buildings.get(building.id),building);
assert.strictEqual(pending[0],job);
assert(memory.witch.has(building.id));
assert(!memory.orc.has(building.id));

// Match resets keep collection identities stable for injected systems. The
// renderer disposes each object before its owner drops the registry entry.
const initial={id:'initial-barrack',initial:true};
buildings.set(initial.id,initial);
const removed=[];
world.resetActors();
world.resetConstruction();
world.removeConstructedBuildings(value=>{
  assert.strictEqual(buildings.get(value.id),value,'dispose before removal');
  removed.push(value.id);
});
assert.deepEqual(removed,[building.id]);
assert.strictEqual(buildings.get(initial.id),initial,'initial village survives');
world.resetVisibility();
assert.strictEqual(world.units,units);
assert.strictEqual(world.selected,selected);
assert.strictEqual(world.buildingInstances,buildings);
assert.strictEqual(world.pendingBuilds,pending);
assert.strictEqual(world.knownEnemyBuildings,memory);
assert.equal(world.units.length,0);
assert.equal(world.pendingBuilds.length,0);
assert.equal(world.buildingInstances.size,1);
assert.equal(world.knownEnemyBuildings.witch.size,0);
assert.equal(world.knownEnemyBuildings.orc.size,0);
world.removeConstructedBuildings(()=>assert.fail('initial building must not be disposed'));
assert.equal(world.buildingInstances.size,1);

// Each actual game instance gets independent entity registries.
const other=create();
assert.notStrictEqual(other.units,world.units);
assert.notStrictEqual(other.selected,world.selected);
assert.notStrictEqual(other.buildingInstances,world.buildingInstances);
assert.notStrictEqual(other.pendingBuilds,world.pendingBuilds);
assert.notStrictEqual(other.knownEnemyBuildings.witch,memory.witch);

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(game.includes('const matchWorld=window.FightersWorldState.create()'));
for(const binding of ['units,selected','knownEnemyBuildings','buildingInstances','pendingBuilds']){
  assert(game.includes(`const {${binding}}=matchWorld;`),`${binding} must alias the world owner`);
}
assert(!game.includes('const units=[],selected=new Set()'));
assert(!game.includes('const buildingInstances=new Map()'));
assert(!game.includes('const pendingBuilds=[]'));
assert(!game.includes('const knownEnemyBuildings={witch:new Set(),orc:new Set()}'));
assert(html.includes('<script src="./rts-world-state.js"></script>'));
console.log('PASS world registries: stable units, selection, buildings, jobs, and isolated enemy memories.');
