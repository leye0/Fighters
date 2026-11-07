import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-orc-forager.js');
const rules=require('../app/rts-orc-food.js');

const hareField=new rules.Hares({count:1,walkable:()=>true});
Object.assign(hareField.hares[0],{x:3,z:0,active:true,caughtBy:null});
const orcFood=new rules.Economy();
const actor={id:8,kind:'orc',root:{position:{x:0,z:0}},orcFoodJob:null};
const witch={id:9,kind:'witch',root:{position:{x:0,z:0}},dead:true,deadTime:30};
const mage={id:10,kind:'orc',soulJob:witch};
const units=[actor,witch,mage];
const events=[];
let navResult='moving';
let danger=false;
const service=create({
  hareField,orcFood,orcFoodRules:rules,units,
  nearestHostile:()=>danger?{target:witch}:null,
  navigateActor:(unit,goal,dt,mode)=>{
    events.push(['navigate',goal.x,goal.z,mode]);return navResult;
  },
  markWorkBlocked:()=>events.push(['blocked']),
  animation:(unit,clip)=>events.push(['animation',clip]),
  faceDirection:(unit,dx,dz)=>events.push(['facing',dx,dz]),
  cancelSoulJob:unit=>{unit.soulJob=null;events.push(['cancel soul']);},
  refreshHUD:()=>events.push(['refresh']),
  harvestAnimation:'Farm_Harvest'
});

assert(Object.isFrozen(service));
assert.equal(service.tick(actor,.1),false,'No job must not consume a tick');
actor.orcFoodJob={kind:'hare',id:0,progress:4};
assert.equal(service.tick(actor,.1),true,'A distant hare must be pursued');
assert.equal(actor.orcFoodJob.progress,0,'No eating while chasing');
assert.deepEqual(events[0],['navigate',3,0,'engage']);
actor.root.position.x=3;
assert.equal(service.tick(actor,.5),true);
assert.equal(hareField.hares[0].caughtBy,actor.id,'Hare is reserved at capture');
assert.equal(actor.orcFoodJob.progress,.5);
assert(events.some(e=>e[1]==='Farm_Harvest'));

// An interrupted hunt must immediately release the live prey.
actor.attackOrder={target:witch};
assert.equal(service.tick(actor,.1),false);
assert.equal(hareField.hares[0].caughtBy,null);
assert.equal(actor.orcFoodJob,null);
actor.attackOrder=null;

// The resumed hunt captures, eats once and credits only real food.
actor.orcFoodJob={kind:'hare',id:0,progress:0};
const initialFood=orcFood.food;
assert.equal(service.tick(actor,rules.EAT_SECONDS),true);
assert.equal(orcFood.food,initialFood+rules.HARE_FOOD);
assert.equal(hareField.hares[0].active,false);
assert.equal(actor.orcFoodJob,null);
assert(events.some(e=>e[0]==='refresh'));
actor.orcFoodJob={kind:'hare',id:0,progress:0};
assert.equal(service.tick(actor,.1),false,'A consumed hare cannot be eaten twice');

// Blocked paths clear the assignment and its reservation.
Object.assign(hareField.hares[0],{x:5,z:1,active:true,caughtBy:actor.id});
actor.root.position.x=0;
actor.orcFoodJob={kind:'hare',id:0,progress:0};
navResult='blocked';
assert.equal(service.tick(actor,.1),true);
assert.equal(actor.orcFoodJob,null);
assert.equal(hareField.hares[0].caughtBy,null);
assert(events.some(e=>e[0]==='blocked'));
navResult='moving';

// A corpse meal can be taken once and releases competing soul harvesters.
actor.orcFoodJob={kind:'corpse',id:witch.id,progress:0};
const beforeCorpse=orcFood.food;
actor.root.position.x=0;
assert.equal(service.tick(actor,rules.EAT_SECONDS),true);
assert.equal(orcFood.food,beforeCorpse+rules.CORPSE_FOOD);
assert.equal(witch.deadTime,0);
assert.equal(mage.soulJob,null);
assert.equal(actor.orcFoodJob,null);
actor.orcFoodJob={kind:'corpse',id:witch.id,progress:0};
assert.equal(service.tick(actor,.1),false);

// The usual food-order cancellation service retains its original semantics.
Object.assign(hareField.hares[0],{active:true,caughtBy:actor.id});
actor.orcFoodJob={kind:'hare',id:0,progress:0};
service.cancel(actor);
assert.equal(hareField.hares[0].caughtBy,null);
assert.equal(actor.orcFoodJob,null);
danger=true;
actor.orcFoodJob={kind:'corpse',id:witch.id,progress:0};
assert.equal(service.tick(actor,.1),false,'Danger cancels a scavenging job');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersOrcForager.create('));
assert(game.includes('return orcForager.cancel(actor)'));
assert(game.includes('return orcForager.tick(actor,dt)'));
console.log('PASS Orc forager: approach, reservation, interruption, consumption, blocked paths and corpse soul cleanup.');
