import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-soul-harvester.js');
const soulRules=require('../app/rts-souls.js');

const mage=(id,x,z)=>({id,kind:'witch',role:'ranged',dead:false,
  root:{position:{x,z}},soulJob:null});
const corpse=(id,x,z)=>({id,kind:'orc',dead:true,deadTime:30,
  soulClaimed:false,soulReservedBy:null,root:{position:{x,z}}});
const first=mage(1,0,0),second=mage(2,1,0);
const body1=corpse(10,2,0),body2=corpse(11,4,0);
const units=[second,first,body1,body2];
let magic={witch:0},visible=true,reachable=true,danger=false,navResult='moving';
const events=[];
const service=create({units,soulRules,getWitchMagic:()=>magic.witch,
  nearestHostile:()=>danger?{target:body1}:null,
  fogOfWar:{visibleAt:(x,z,clan)=>{
    assert.equal(clan,'witch');return visible;
  }},navigatorRTS:{segmentClear:()=>reachable,plan:()=>reachable?[]:null},
  navigateActor:(actor,to,dt,mode)=>{
    events.push(['navigate',actor.id,to.x,to.z,mode]);return navResult;
  },markWorkBlocked:actor=>events.push(['blocked',actor.id]),
  animation:(actor,clip)=>events.push(['animation',actor.id,clip]),
  faceDirection:(actor,dx,dz)=>events.push(['face',actor.id,dx,dz]),
  playWitchVoice:(category,actor)=>events.push(['voice',category,actor.id]),
  beginSoulEffect:(body,actor)=>events.push(['soul effect',body.id,actor.id])});
assert(Object.isFrozen(service));
service.assign(.64);
assert.equal(first.soulJob,null,'Assignments wait the original 650ms');
service.assign(.01);
assert.equal(second.soulJob,body1,'Nearest valid corpse goes to nearest Mage');
assert.equal(first.soulJob,body2,'Two Mages cannot claim the same corpse');
assert.equal(body1.soulReservedBy,second.id);
assert.equal(body2.soulReservedBy,first.id);
service.cancel(first);
assert.equal(first.soulJob,null);
assert.equal(body2.soulReservedBy,null,'Cancelling releases a corpse reservation');

// Movement uses real navigation and waits for the actual Death01 pose.
assert.equal(service.tick(second,.1),true);
assert(events.some(e=>e[0]==='navigate'&&e[1]===second.id&&e[4]==='engage'));
second.root.position.x=2;
body1.current='Death01';body1.action={isRunning:()=>true};
assert.equal(service.tick(second,.1),true);
assert.equal(body1.soulClaimed,false,'A standing body cannot be copied as a spirit');
body1.action.isRunning=()=>false;
assert.equal(service.tick(second,.1),true);
assert.equal(body1.soulClaimed,true);
assert.equal(body1.soulReservedBy,null);
assert.equal(second.soulJob,null);
assert(events.some(e=>e[0]==='voice'&&e[1]==='interaction'));
assert(events.some(e=>e[0]==='soul effect'&&e[1]===body1.id));

// An interrupted or blocked route releases the corpse for another Mage.
first.soulJob=body2;body2.soulReservedBy=first.id;
first.attackOrder={};
assert.equal(service.tick(first,.1),false);
assert.equal(body2.soulReservedBy,null);
first.attackOrder=null;first.soulJob=body2;body2.soulReservedBy=first.id;
navResult='blocked';
assert.equal(service.tick(first,.1),false);
assert.equal(first.soulJob,null);
assert.equal(body2.soulReservedBy,null);
assert(events.some(e=>e[0]==='blocked'));
navResult='moving';

// No hidden, threatened, unreachable or no-budget-needed assignments.
visible=false;service.reset();service.assign(.65);
assert.equal(first.soulJob,null,'Fog prevents soul omniscience');
visible=true;reachable=false;service.reset();service.assign(.65);
assert.equal(first.soulJob,null,'Pathfinding rejects inaccessible corpses');
reachable=true;danger=true;service.reset();service.assign(.65);
assert.equal(first.soulJob,null,'Danger preempts harvesting');
danger=false;magic={witch:soulRules.MAX_MAGIC};service.reset();
service.assign(.65);assert.equal(first.soulJob,null,'No work at full magic');
magic={witch:0};service.assign(.64);
assert.equal(first.soulJob,null,'Full-magic ticks do not accrue hidden cadence');
service.reset();service.assign(.1);
assert.equal(first.soulJob,null,'New games clear partial assignment timing');
service.assign(.55);
assert.equal(second.soulJob,body2,'The available corpse can be reserved again');
assert.equal(first.soulJob,null,'An earlier Mage reserves the corpse first');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersSoulHarvester.create('));
assert(game.includes('return soulHarvester.cancel(actor)'));
assert(game.includes('return soulHarvester.assign(dt)'));
assert(game.includes('return soulHarvester.tick(actor,dt)'));
assert(game.includes('soulHarvester.reset()'));
assert(!game.includes('soulAssignmentElapsed='));
console.log('PASS Witch soul work: fog, reservations, pathing, death pose, magic cap and reset.');
