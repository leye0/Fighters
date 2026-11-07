import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-orc-hunt-planner.js');
const rules=require('../app/rts-orc-food.js');

const actor=(id,x,z,kind='orc')=>({id,kind,dead:false,root:{position:{x,z}},
  orcFoodJob:null,route:{},approachCache:{}});
const hunter=actor(1,0,0);
const scout=actor(2,1,0);
const witch=actor(3,2,0,'witch');
witch.dead=true;witch.deadTime=3;
const units=[hunter,scout,witch];
const orcFood=new rules.Economy();orcFood.food=0;
const hares=[{id:0,x:3,z:0,active:true,caughtBy:null}];
const paths=[];
let explored=true,passive=false,directorEnabled=false,hostile=false,reachable=true;
const planner=create({units,orcFood,orcFoodRules:rules,hareField:{hares},
  fogOfWar:{exploredAt:(x,z,clan)=>{assert.equal(clan,'orc');return explored;}},
  navigatorRTS:{segmentClear:()=>reachable,plan:(start,target)=>{
    paths.push([start,target]);return reachable?[]:null;
  }},
  nearestHostile:()=>hostile?{target:witch}:null,
  isOrcPassive:()=>passive,isOrcDirectorEnabled:()=>directorEnabled});

assert(Object.isFrozen(planner),'Public controller API is immutable');
planner.assign(.79);
assert.equal(hunter.orcFoodJob,null,'Assignments honor the original 800ms cadence');
passive=true;planner.assign(.8);
assert.equal(hunter.orcFoodJob,null,'QA passive mode must suspend foraging');
passive=false;planner.assign(.01);
assert.deepEqual(scout.orcFoodJob,{kind:'corpse',id:witch.id,progress:0},
  'A corpse is preferred to a nearby hare');
assert.deepEqual(hunter.orcFoodJob,{kind:'hare',id:0,progress:0},
  'A different Orc takes the live hare without stealing the corpse');
assert.equal(hunter.route,null);
assert.equal(hunter.approachCache,null);

// No third job, even if another hunter or prey appears.
const third=actor(4,0,0);units.push(third);
hares.push({id:1,x:4,z:0,active:true,caughtBy:null});
planner.assign(.8);
assert.equal(third.orcFoodJob,null,'At most two jobs at once');

// Visibility, pathfinding and enemy proximity all reject otherwise edible prey.
hunter.orcFoodJob=null;scout.orcFoodJob=null;
witch.deadTime=0;hares[0].active=false;
planner.reset();explored=false;planner.assign(.8);
assert.equal(third.orcFoodJob,null,'Undiscovered hares are not hunted');
explored=true;reachable=false;planner.assign(.8);
assert.equal(third.orcFoodJob,null,'Unreachable hares are not assigned');
assert(paths.length>0,'Blocked direct paths trigger fallback path planning');
reachable=true;hostile=true;planner.assign(.8);
assert.equal(third.orcFoodJob,null,'Nearby enemies take priority over hunting');

// Manual move orders are respected; automatic scouts resume after chasing.
hostile=false;hunter.destination={x:99,z:99};scout.destination={x:99,z:99};
third.destination={x:99,z:99};planner.assign(.8);
assert.equal(third.orcFoodJob,null,'Manual destinations must not be preempted');
scout.scouting=true;directorEnabled=true;
planner.assign(.8);
assert.deepEqual(scout.orcFoodJob,{kind:'hare',id:1,progress:0});
assert.equal(scout.destination,null);
assert.equal(scout.scouting,false,'The autonomous scout yields to food work');

// Reset must discard partial cadence between matches.
scout.orcFoodJob=null;scout.destination=null;scout.scouting=false;
planner.assign(.4);planner.reset();
planner.assign(.4);
assert.equal(scout.orcFoodJob,null,'Reset clears the previous match timer');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersOrcHuntPlanner.create('));
assert(game.includes('return orcHuntPlanner.assign(dt)'));
assert(game.includes('orcHuntPlanner.reset()'));
assert(!game.includes('orcForageElapsed='),'Old free timer must be removed');
console.log('PASS Orc hunt planner: cadence, corpse preference, job cap, fog, path, enemy, scout and reset.');
