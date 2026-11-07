#!/usr/bin/env node
/** Fast deterministic checks for the AI when the human plays the orks. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {Director,planSite,defendersNear}=require('../app/witch-strategy.js');
const {FogGrid}=require('../app/rts-fog.js');

const house={id:'home',type:'witch-house',x:-23,z:-17,level:1,
 health:500,maxHealth:500,queue:[]};
const valid=(x,z,type)=>x<0&&x>-27&&z>-25&&z<25&&type!=='invalid';
for(const type of ['garden','stone-circle','witch-house']){
 const site=planSite(type,[house],valid);
 assert(site&&valid(site.x,site.z,type),type+' must have legal placement');
 assert.deepEqual(planSite(type,[house],valid),site,'Site placement must be deterministic');
}
assert.equal(planSite('garden',[house],()=>false),null,'Never build without a valid site');
assert.equal(planSite('mine',[house],valid),null,'Natural mines are not constructible');

const fog=new FogGrid();
fog.update('witch',[{x:-18,z:-15}]);
fog.update('orc',[{x:19,z:18}]);
assert.equal(fog.sample(19,18,'witch').explored,0,'Enemy exploration is private');
assert(fog.frontier('witch',{x:-18,z:-15},valid),'Witches must have a scout frontier');

const director=new Director();
const worker={id:1,role:'worker',x:-17,z:-14};
const guard=(id,x=-16,z=-13)=>({id,role:'melee',x,z,health:85,maxHealth:85});
assert.deepEqual(defendersNear([worker,guard(2),guard(3,5,5)],{x:-17,z:-14}),[2],
 'Only nearby combat witches, not workers or far-away guards, retaliate');
const state={ready:true,running:true,paused:false,homeId:'home',buildings:[house],
 pendingBuilds:[],gold:2000,wood:250,food:45,
 circleUnlocked:false,arcanistUnlocked:false,witches:[worker,guard(2),guard(3)],
 orcs:[],enemyTarget:null,scoutTarget:{x:-3,z:-1},unitCap:17};
let actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='train'&&a.role==='worker'),
 'AI should replace missing economic workers first');
assert(!actions.some(a=>a.type==='raid'),'AI must not raid an undiscovered village');
director.update(3,state,valid);
director.update(3,state,valid);
assert(director.snapshot().decisions.some(a=>a.type==='scout'),
 'AI should explore its own fog');

state.witches.push({id:4,role:'worker',x:-18,z:-12});
actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='build'&&a.building==='garden'),
 'The food economy needs an early garden');
state.pendingBuilds=[{type:'garden'}];
actions=director.update(3,state,valid);
assert(!actions.some(a=>a.type==='build'&&a.building==='garden'),
 'A garden already under construction must not be duplicated');
state.pendingBuilds=[];state.buildings.push({id:'garden',type:'garden',x:-17,z:-10,
 level:1,queue:[],health:180,maxHealth:180});
for(let i=0;i<4;i++)actions=director.update(3,state,valid);
assert(director.snapshot().decisions.some(a=>a.type==='upgrade'&&a.buildingId==='home'),
 'AI should unlock the sanctuary through a house upgrade');

house.level=2;state.circleUnlocked=true;state.food=15;
state.buildings.push({id:'garden2',type:'garden',x:-9,z:-13,level:1,
 queue:[],health:180,maxHealth:180});
actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='build'&&a.building==='stone-circle'),
 'AI should build a circle before recruiting arcanists');
state.buildings.push({id:'circle',type:'stone-circle',x:-12,z:-15,level:1,
 queue:[],health:280,maxHealth:280});
state.arcanistUnlocked=true;state.food=50;
actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='train'&&a.role==='ranged'),
 'AI should recruit arcanists after unlocking the circle');

state.witches.push(guard(5),guard(6),guard(7));
state.enemyTarget={id:'discovered-orc-barrack'};
actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='raid'&&a.targetId==='discovered-orc-barrack'),
 'AI should attack only its discovered enemy target with a real squad');
assert.equal(director.snapshot().raids,1);
state.orcs=[{id:90,x:-18,z:-15,role:'melee'}];
actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='defend'),
 'A visible threat near home should trigger immediate defense');
assert.equal(director.mode,'defend');
// A scout or worker attacked away from the village still needs protection.
state.orcs=[{id:91,x:11,z:11,role:'melee'}];
state.witches.push({id:92,role:'worker',x:12,z:12});
actions=director.update(3,state,valid);
assert(actions.some(a=>a.type==='defend'),
 'A visible raider near an outlying witch must trigger a response');
director.reset();
assert.equal(director.snapshot().raids,0);
assert.equal(director.snapshot().decisions.length,0);
director.enabled=false;
assert.deepEqual(director.update(3,state,valid),[]);

const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(html.includes('Orks &amp; Sorcières'),'The menu must show the exact new title');
assert(html.includes('id="choose-orc"')&&html.includes('id="choose-witch"'),
 'The menu must expose both playable factions');
assert(game.includes('witchDirector.enabled=!qaMode&&session.chosenFaction===\'orc\''),
 'Witch AI must be the opponent when playing the orks');
assert(game.includes('orcDirector.enabled=!qaMode&&session.chosenFaction===\'witch\''),
 'Orc AI must be the opponent when playing the witches');
assert(game.includes("const playerWon=victory===(session.chosenFaction==='witch')"),
 'Victory must follow the chosen faction, not QA-only camera/faction switching');
console.log('PASS witch strategy: food, training, research, buildings, repair/defense, fog, raids, faction choice.');
