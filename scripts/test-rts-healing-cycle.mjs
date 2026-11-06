import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-healing-cycle.js');
const stoneHealing=require('../docs/rts-healing.js');

const actor=(id,x,z,health=50)=>({id,kind:'witch',dead:false,health,maxHealth:100,
  healRetry:0,root:{position:{x,z}},route:{},approachCache:{}});
const resting=actor(1,0,0,40);
resting.destination={x:1,z:1}; // Manual orders must survive even if already inside.
const retreating=actor(2,4,0,50);
retreating.berryJob={index:0};retreating.soulJob={id:'corpse'};
const full=actor(3,5,0,100);
const dead=actor(4,5,0,20);dead.dead=true;
const units=[resting,retreating,full,dead];
const circle={id:'stones',type:'stone-circle',destroyed:false,root:{position:{x:0,z:0}}};
const buildings=new Map([[circle.id,circle]]);
const events=[];
let magic={witch:2},safe=true,reachable=true,navResult='moving';
const healing=create({units,buildingInstances:buildings,stoneHealing,
  getWitchMagic:()=>magic.witch,
  setWitchMagic:value=>{magic.witch=value;events.push(['magic',value]);},
  nearestHostile:()=>safe?null:{target:{kind:'orc'}},
  navigatorRTS:{segmentClear:()=>reachable,plan:()=>reachable?[{x:0,z:0}]:null},
  cancelSoulJob:unit=>{unit.soulJob=null;events.push(['cancel soul',unit.id]);},
  animation:(unit,clip)=>events.push(['animation',clip]),
  navigateActor:(unit,goal,dt,mode)=>{
    events.push(['navigate',unit.id,goal.x,goal.z,mode]);return navResult;
  }});
assert(Object.isFrozen(healing));

healing.step(.5);
assert.equal(resting.health,45.5,'Already-resting Witches heal on every tick');
assert(Math.abs(magic.witch-(2-5.5/15))<1e-9,'Real health consumes real magic');
assert.equal(retreating.healJob,undefined,'Automatic assignment waits 850ms');
healing.step(.35);
assert.deepEqual(retreating.healJob,{id:circle.id});
assert.equal(retreating.soulJob,null,'Soul work is cancelled for a healing retreat');
assert.equal(retreating.berryJob,null);
assert.equal(retreating.route,null);
assert.equal(retreating.approachCache,null);
assert.deepEqual(resting.destination,{x:1,z:1},'Manual orders are not overwritten');

events.length=0;
assert.equal(healing.tickRetreat(retreating,.1),true);
assert(events.some(e=>e[0]==='navigate'&&e[1]===retreating.id&&e[4]==='order'));
retreating.root.position.x=.3;
assert.equal(healing.tickRetreat(retreating,.1),true);
assert(events.some(e=>e[0]==='animation'&&e[1]==='Idle_Loop'));
retreating.root.position.x=4;navResult='blocked';
assert.equal(healing.tickRetreat(retreating,.1),false);
assert.equal(retreating.healJob,null);
assert.equal(retreating.healRetry,6,'Blocked paths impose the original retry cooldown');
navResult='moving';

// The same service cannot keep a reference to an old match's magic object.
magic={witch:0};
healing.step(.1);
assert.equal(resting.health,49.35,'No free healing after available magic is exhausted');
assert.equal(magic.witch,0);

// Enemies, obstacles and player commands preempt autonomous retreats.
retreating.healRetry=0;safe=false;healing.reset();healing.step(.85);
assert.equal(retreating.healJob,null,'Hostile proximity prevents auto-retreat');
safe=true;reachable=false;healing.reset();healing.step(.85);
assert.equal(retreating.healJob,null,'Unreachable sanctuaries are rejected');
reachable=true;retreating.destination={x:8,z:8};healing.reset();healing.step(.85);
assert.equal(retreating.healJob,null,'Player destinations are not overridden');
retreating.destination=null;healing.reset();healing.step(.8);
assert.equal(retreating.healJob,null);
healing.reset();healing.step(.1);
assert.equal(retreating.healJob,null,'Reset discards partial scheduling time');
healing.step(.75);
assert.deepEqual(retreating.healJob,{id:circle.id});
retreating.attackOrder={};
assert.equal(healing.tickRetreat(retreating,.1),false);
assert.equal(retreating.healJob,null,'Combat orders interrupt healing immediately');

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersHealingCycle.create('));
assert(game.includes('return healingCycle.step(dt)'));
assert(game.includes('return healingCycle.tickRetreat(actor,dt)'));
assert(game.includes('healingCycle.reset()'));
assert(!game.includes('healingAssignmentElapsed='));
console.log('PASS Witch healing: paid shared magic, real rest, assignments, combat, blocked paths and reset.');
