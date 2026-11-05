#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const rules=require('../docs/rts-orc-food.js');

const buildings=[
  {type:'hut',clanId:'orcs',level:1,destroyed:false},
  {type:'cauldron',clanId:'orcs',level:1,destroyed:false}
];
assert.equal(rules.housingCap(buildings),10,'First hut houses six orcs plus base capacity');
assert(rules.hasCauldron(buildings),'Intact cauldron unlocks orc ranged mages');
buildings[0].level=2;
assert.equal(rules.housingCap(buildings),14,'Level 2 hut adds capacity');
buildings[0].level=3;
assert.equal(rules.housingCap(buildings),18,'Level 3 hut adds capacity');
buildings.push({type:'hut',clanId:'orcs',level:3,destroyed:false});
assert.equal(rules.housingCap(buildings),32,'Population is bounded for performance');
buildings[0].destroyed=true;
assert.equal(rules.housingCap(buildings),18,'Destroyed hut no longer houses orcs');
buildings[1].destroyed=true;
assert(!rules.hasCauldron(buildings),'Destroyed cauldron cannot unlock mages');

const economy=new rules.Economy();
assert.equal(economy.food,rules.STARTING_FOOD);
const rate=rules.FOOD_PER_ORC_SECOND;
assert(rate<.06/2,'Orcs must eat substantially less often than witches');
economy.step(20,4);
assert(Math.abs(economy.food-(rules.STARTING_FOOD-80*rate))<1e-6);
assert.equal(economy.eatHare(),rules.HARE_FOOD);
assert.equal(economy.eatCorpse('witch-1'),rules.CORPSE_FOOD);
assert.equal(economy.eatCorpse('witch-1'),0,'A corpse is edible only once');
assert(rules.CORPSE_FOOD>=4*rules.HARE_FOOD,'Witch corpses are much richer than hares');
assert(economy.step(1e4,4).starvedSeconds>0,'Starvation must eventually matter');
assert.equal(economy.food,0);
economy.reset();
assert.equal(economy.food,rules.STARTING_FOOD);
assert.equal(economy.eatCorpse('witch-1'),rules.CORPSE_FOOD,'Reset clears reservations');

const field=new rules.Hares({count:16,walkable:(x,z)=>Math.abs(x)<27&&Math.abs(z)<27});
const start=field.hares.map(({x,z})=>({x,z}));
assert.equal(field.hares.length,16,'Many hares must roam');
field.step(1,[]);
assert(field.hares.some((hare,i)=>Math.hypot(hare.x-start[i].x,hare.z-start[i].z)>.1),
  'Hares must visibly move without player orders');
assert(field.catch(0,'orc-1'),'A nearby orc must be able to capture a hare');
assert(!field.catch(0,'orc-2'),'Two orcs cannot capture the same hare');
const captured={x:field.hares[0].x,z:field.hares[0].z};
field.step(3,[{x:captured.x,z:captured.z}]);
assert.deepEqual({x:field.hares[0].x,z:field.hares[0].z},captured,
  'Captured prey must stay in place while the orc eats');
assert(!field.release(0,'orc-2'),'Another orc cannot release captured prey');
assert(field.release(0,'orc-1'),'Interrupted hunts must release the hare');
assert(field.catch(0,'orc-2'),'A released hare is available for another hunter');
assert(field.eat(0),'A hare may be hunted');
assert(!field.eat(0),'The same hare may not be eaten twice');
field.step(rules.RESPAWN_SECONDS+16,[]);
assert(field.hares[0].active,'Wildlife renews after a finite delay');
field.reset();
assert.deepEqual(field.hares.map(({x,z})=>({x,z})),start,
  'New matches restore a reproducible wildlife distribution');
console.log('PASS orc food: cauldron technology, hut housing, hunger, carcasses, roaming/respawning hares.');
