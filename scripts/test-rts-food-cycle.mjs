import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-food-cycle.js');

const orc1={id:1,kind:'orc',dead:false,health:5,root:{position:{x:1,z:2}}};
const orc2={id:2,kind:'orc',dead:false,health:1,root:{position:{x:3,z:4}}};
const witch1={id:3,kind:'witch',dead:false,health:5,root:{position:{x:5,z:6}}};
const witch2={id:4,kind:'witch',dead:false,health:1,root:{position:{x:7,z:8}}};
const fallen={id:5,kind:'orc',dead:true,health:0,root:{position:{x:9,z:10}}};
const units=[orc1,orc2,witch1,witch2,fallen];
const events=[];
const orcFood={food:0,step:(dt,count)=>{
  events.push(['orc food',dt,count]);return {starvedSeconds:1};
}};
const farming={food:0,step:(dt,count)=>{
  events.push(['witch food',dt,count]);return {starvedSeconds:1};
}};
const garden={type:'garden',destroyed:false};
const destroyedGarden={type:'garden',destroyed:true};
const barrack={type:'barrack',destroyed:false};
const cycle=create({units,hareField:{step:(dt,positions)=>{
  events.push(['hares',dt,positions]);
}},orcFood,orcFoodRules:{STARVATION_DAMAGE:2},
  assignOrcForagers:dt=>events.push(['hunt',dt]),
  wildBerries:{step:dt=>events.push(['berries',dt])},
  syncBerryVisuals:()=>events.push(['berry visuals']),farming,
  buildingInstances:new Map([[1,garden],[2,destroyedGarden],[3,barrack]]),
  syncGardenVisual:b=>events.push(['garden visuals',b]),
  assignGardenWorkers:dt=>events.push(['garden jobs',dt]),
  assignBerryForagers:dt=>events.push(['berry jobs',dt]),
  witchStarvationDamage:3,
  showBanner:message=>events.push(['banner',message]),
  dealDamage:(actor,amount,source)=>events.push(['fatal',actor.id,amount,source])});
assert(Object.isFrozen(cycle));

cycle.stepOrcs(.5);
assert.deepEqual(events,[
  ['hares',.5,[orc1.root.position,orc2.root.position]],
  ['orc food',.5,2],['hunt',.5],
  ['banner','FAMINE : LES ORCS PERDENT DES PV'],['fatal',orc2.id,2,null]
]);
assert.equal(orc1.health,3);
assert.equal(orc2.health,1,'The existing damage service handles a lethal hit');
events.length=0;cycle.stepOrcs(.5);
assert.equal(events.filter(e=>e[0]==='banner').length,0,
  'Sustained famine displays only one Orc alert');
orcFood.food=1;cycle.stepOrcs(.5);
orcFood.food=0;events.length=0;cycle.stepOrcs(.5);
assert(events.some(e=>e[0]==='banner'),'Food recovery rearms the famine alert');

events.length=0;cycle.stepWitches(.25);
assert.deepEqual(events,[
  ['berries',.25],['berry visuals'],['witch food',.25,2],
  ['garden visuals',garden],['garden jobs',.25],['berry jobs',.25],
  ['banner','FAMINE : LES SORCIÈRES PERDENT DES PV'],['fatal',witch2.id,3,null]
]);
assert.equal(witch1.health,2);
events.length=0;cycle.stepWitches(.25);
assert.equal(events.filter(e=>e[0]==='banner').length,0);
cycle.reset();events.length=0;cycle.stepWitches(.25);
assert(events.some(e=>e[0]==='banner'),
  'A new match resets the Witch famine alert');
events.length=0;cycle.stepOrcs(.5);
assert(events.some(e=>e[0]==='banner'),
  'A new match resets the Orc famine alert independently');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersFoodCycle.create('));
assert(game.includes('return foodCycle.stepOrcs(dt)'));
assert(game.includes('return foodCycle.stepWitches(dt)'));
assert(game.includes('foodCycle.reset()'));
assert(!/\b(?:orcFamineAlerted|famineAlerted)\b/.test(game),
  'Both famine flags must belong to the food cycle');
console.log('PASS faction food cycle: tick order, living population, two famines, lethal hits and reset.');
