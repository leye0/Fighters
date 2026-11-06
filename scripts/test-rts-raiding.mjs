#!/usr/bin/env node
/** Combat regression: assault squads finish the enemy village, but fight back. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const raid=require('../docs/rts-raiding.js');

const actor={kind:'witch',root:{position:{x:12,z:10}},attackOrder:null,
 unreachableTarget:null,unreachableTime:0};
const building=(id,x,clanId='orcs')=>({id,clanId,hitbox:{minX:x,maxX:x+2,
 minZ:10,maxZ:12},destroyed:false});
const fallen=building('fallen',12),near=building('near',19),far=building('far',29);
const hidden=building('hidden',14),friendly=building('friendly',15,'witch');
const buildings=[fallen,near,far,hidden,friendly];
const discovered=new Set(['fallen','near','far','friendly']);
const enemy=(unit,target)=>target&&!target.dead&&!target.destroyed&&
 target.clanId!==unit.kind;
const distance=(unit,target)=>Math.abs(target.hitbox.minX-unit.root.position.x);

raid.begin(actor);
actor.attackOrder=fallen;
assert(actor.raiding,'Explicit building assault must remain a raid');
fallen.destroyed=true;actor.attackOrder=null;
assert.equal(raid.nextBuilding(actor,buildings,discovered,enemy,distance),near,
 'After destruction, attack the nearest known hostile building, not home');
assert.notEqual(raid.nextBuilding(actor,buildings,discovered,enemy,distance),hidden,
 'An undiscovered building must never become an automatic target');
actor.unreachableTarget=near;actor.unreachableTime=6;
assert.equal(raid.nextBuilding(actor,buildings,discovered,enemy,distance),far,
 'A temporarily blocked building must not stop the entire raid');
actor.unreachableTime=0;

const attacker={kind:'orc',clanId:'orcs',root:{position:{x:16,z:11}}};
assert(raid.attacked(actor,attacker,enemy),
 'An attacked raider must defend itself without forgetting its building');
assert.equal(raid.retaliation(actor,enemy),attacker);
assert.equal(actor.attackOrder,null,'Retaliation does not need to overwrite the raid order');
actor.attackOrder=near;
assert.equal(raid.retaliation(actor,enemy),attacker,
 'A living attacker takes priority even while a building remains ordered');
attacker.dead=true;
assert.equal(raid.retaliation(actor,enemy),null,
 'Once the attacker dies, restore the underlying building order');
assert.equal(actor.attackOrder,near);
attacker.dead=false;
raid.attacked(actor,attacker,enemy);
attacker.root.position.x=35;
assert.equal(raid.retaliation(actor,enemy),null,
 'Do not chase a retreating enemy all the way to its village');
raid.end(actor);
assert(!actor.raiding&&!actor.retaliationTarget,
 'An explicit movement order must be able to cancel a raid');
assert(!raid.attacked(actor,attacker,enemy),
 'A unit outside a raid must keep its normal defense rules');

const html=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(entry.includes('src="./rts-raiding.js"')&&
  entry.indexOf('src="./rts-raiding.js"')<entry.indexOf('src="./game.js"'),
  'Load raid AI before the game engine');
assert(html.includes('actor.attackOrder=nextRaidBuilding(actor)'),
 'The combat tick must reassign destroyed building orders');
assert(html.includes('const explicit=retaliation||actor.attackOrder'),
 'Attackers must take priority over a raider\'s building');
assert(html.includes('!u.raiding&&'),'Committed raiders must not be recalled as guards');
console.log('PASS RTS raiding: destroy-and-continue, fog, unreachable targets, retaliation, leash, cancellation and engine wiring.');
