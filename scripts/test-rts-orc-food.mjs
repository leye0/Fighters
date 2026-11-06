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
assert(rules.HUNT_SIGHT>=15,'Idle orcs should notice hares farther away');
assert(rules.MAX_HUNTERS>=4,'Several idle orcs should be able to hunt at once');
assert(rules.shouldHuntHares(rules.STARTING_FOOD,4),
  'Orcs should hunt proactively before food reserves run low');
assert(rules.shouldHuntHares(130,4),
  'Orcs should keep hunting to create a meaningful safety stockpile');
assert(!rules.shouldHuntHares(500,4),
  'Orcs must not abandon all their work when their food reserve is abundant');
assert(rules.HARE_FLEE_SPEED<2.75*.6,
  'An orc must be decisively faster than a fleeing hare');
assert(rules.HARE_CAPTURE_DISTANCE>=1,
  'Orcs need a forgiving physical grab distance');
const start=field.hares.map(({x,z})=>({x,z}));
assert.equal(field.hares.length,16,'Many hares must roam');
field.step(1,[]);
assert(field.hares.some((hare,i)=>Math.hypot(hare.x-start[i].x,hare.z-start[i].z)>.1),
  'Hares must visibly move without player orders');
const leaping={...field.hares[1],moving:true,hopPhase:Math.PI/2};
const airborne=rules.hareAnimationPose(leaping,field.elapsed);
assert(airborne.height>.2&&airborne.stretch>1&&airborne.squash<1,
  'An animated running hare must actually leap, extend and tuck its body');
const landing=rules.hareAnimationPose({...leaping,hopPhase:0},field.elapsed);
assert.equal(landing.height,0,'A hop must return the hare to the ground');
const atRest=rules.hareAnimationPose({...leaping,moving:false},field.elapsed);
assert.equal(atRest.height,0,'A stationary or caught hare must stay grounded');
assert(Math.abs(atRest.pitch)<.03,'A resting hare breathes without pitching out of control');
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
const chase=new rules.Hares({count:1,walkable:()=>true});
chase.hares[0].x=0;chase.hares[0].z=0;
const hunter={x:0,z:3.1};
let chaseSeconds=0;
while(chaseSeconds<4){
  const prey=chase.hares[0],gap=Math.hypot(prey.x-hunter.x,prey.z-hunter.z);
  if(gap<=rules.HARE_CAPTURE_DISTANCE)break;
  chase.step(.05,[hunter]);
  const dx=prey.x-hunter.x,dz=prey.z-hunter.z,norm=Math.hypot(dx,dz);
  hunter.x+=2.75*.05*dx/norm;hunter.z+=2.75*.05*dz/norm;
  chaseSeconds+=.05;
}
assert(chaseSeconds<3,'An ordinary orc must catch a nearby hare in open ground');
// A hare fleeing towards a large building must steer around it, not run into
// the same blocked surface forever or clip through solid terrain.
const obstacle=(x,z)=>!(x>.8&&x<3.1&&z>-1.1&&z<1.1);
const trapped=new rules.Hares({count:1,halfSize:15,walkable:obstacle});
Object.assign(trapped.hares[0],{x:0,z:0,heading:Math.PI/2,turnIn:100,escapeIn:0});
let longestStall=0,stall=0,previous={x:0,z:0};
for(let i=0;i<300;i++){
  trapped.step(.05,[{x:-2,z:0}]);
  const h=trapped.hares[0];
  assert(obstacle(h.x,h.z),'A hare may never run through a solid building');
  const displacement=Math.hypot(h.x-previous.x,h.z-previous.z);
  stall=displacement<.001?stall+.05:0;
  longestStall=Math.max(longestStall,stall);
  previous={x:h.x,z:h.z};
}
assert(longestStall<1.6,'Hares must escape instead of remaining stuck on obstacles');
assert(Math.hypot(trapped.hares[0].x,trapped.hares[0].z)>5,
  'A chased hare must keep escaping around the building');
// If a new structure is placed over a hare, relocate it to clear terrain.
const newlyBlocked=new rules.Hares({count:1,walkable:(x,z)=>x>2});
newlyBlocked.hares[0].x=0;
newlyBlocked.step(.05);
assert(newlyBlocked.hares[0].x>2,'A hare engulfed by construction must be freed');
console.log('PASS orc food: cauldron technology, hut housing, hunger, carcasses, roaming/respawning hares.');
