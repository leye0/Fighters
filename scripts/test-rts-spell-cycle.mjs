import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import cycle from '../docs/rts-spell-cycle.js';
import dome from '../docs/rts-witch-dome.js';
import fire from '../docs/rts-fire-rain.js';

const unit=(kind,role,x,z,health=100)=>({kind,role,health,maxHealth:health,
  dead:false,root:{position:{x,z}}});
const witch=unit('witch','melee',0,0),orc=unit('orc','melee',0,0);
const fallen=unit('orc','melee',0,0);fallen.dead=true;
const effect={x:0,z:0,elapsed:0,radius:0};
let killed=[];
const kill=actor=>{killed.push(actor);actor.dead=true;actor.deadTime=1.25;};

assert.equal(cycle.advanceDome(effect,.5),false);
assert.equal(effect.radius,dome.radiusAt(.5));
cycle.applyDomeDamage(effect,[witch,orc,fallen,unit('orc','ranged',effect.radius+.1,0)],kill);
assert.deepEqual(killed,[orc],'only living enemy orcs inside the expanding radius die');
cycle.applyDomeDamage(effect,[orc],kill);
assert.equal(killed.length,1,'a corpse must not be struck a second time');
assert.equal(cycle.advanceDome(effect,dome.DURATION-.5),true);
assert.equal(effect.radius,dome.RADIUS);
const boundaryOrc=unit('orc','worker',dome.RADIUS,0);
cycle.applyDomeDamage(effect,[boundaryOrc],kill);
assert.equal(boundaryOrc.dead,true,'damage still occurs on the last frame before disposal');

const fireEffect={x:0,z:0,elapsed:0,radius:0};
const fireTarget=unit('witch','melee',0,0),fireOutside=unit('witch','ranged',21,0);
const fireOrc=unit('orc','melee',0,0);
killed=[];
assert.equal(cycle.advanceFireRain(fireEffect,.6),false);
cycle.applyFireRainDamage(fireEffect,[fireTarget],kill);
assert.equal(killed.length,0,'fire damage does not begin before 0.7 seconds');
cycle.advanceFireRain(fireEffect,.1);
cycle.applyFireRainDamage(fireEffect,[fireTarget,fireOutside,fireOrc],kill);
assert.deepEqual(killed,[fireTarget],'first damage instant affects only the exact centre');
assert.equal(fireEffect.radius,0);
cycle.advanceFireRain(fireEffect,1);
assert.equal(fireEffect.radius,fire.RADIUS);
cycle.applyFireRainDamage(fireEffect,[fireOutside],kill);
assert.equal(fireOutside.dead,false,'targets outside the 20-unit blast are safe');
assert.equal(cycle.advanceFireRain(fireEffect,fire.DURATION-1.7),true);
cycle.applyFireRainDamage(fireEffect,[unit('witch','melee',0,0)],kill);
assert.equal(killed.length,1,'no damage after the 3.65-second damage window');

const hut=(id,x=0)=>({id,type:'hut',clanId:'orcs',level:3,destroyed:false,
  hitbox:{minX:x-1,maxX:x+1,minZ:-1,maxZ:1}});
const house={id:'witch-house',type:'witch-house',clanId:'witch',level:3,destroyed:false,
  hitbox:{minX:99,maxX:101,minZ:99,maxZ:101}};
const attackers=[unit('witch','melee',2,3),unit('witch','ranged',3,4),
  unit('witch','melee',4,5),unit('orc','melee',102,103),
  unit('orc','ranged',103,104),unit('orc','melee',104,105)];
const state={running:true,paused:false,spellDecisionElapsed:0};
let huts=[hut('hut-1')],magic={witch:100,orc:100};
let witchAI=true,orcAI=true,activeDome=false,activeFire=false,visible=true;
let orcCastResult=true,casts=[],queries=[];
const defense=cycle.createDefense({state,
  getBuildings:()=>huts,getWitchHouse:()=>house,getUnits:()=>attackers,
  getMagic:()=>magic,witchEnabled:()=>witchAI,orcEnabled:()=>orcAI,
  domeActive:()=>activeDome,fireActive:()=>activeFire,
  visible:(x,z,clan)=>{queries.push(clan);return visible;},
  castWitch:home=>{casts.push(home.id);return true;},
  castOrc:home=>{casts.push(home.id);return orcCastResult;}
});
defense.step(1.49);
assert.deepEqual(casts,[],'automatic spells only reconsider every 1.5 seconds');
assert.equal(state.spellDecisionElapsed,1.49);
defense.step(.01);
assert.deepEqual(casts,['hut-1'],'first successful orc hut prevents a witch cast');
assert.equal(state.spellDecisionElapsed,0,'the cadence resets, not subtracts the interval');
assert(queries.every(clan=>clan==='orc'),'a successful first hut ends the decision pass');

casts=[];orcCastResult=false;huts=[hut('hut-1'),hut('hut-2',3)];
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,['hut-1','hut-2','witch-house'],
  'failed orc casts try later huts before considering the witch HQ');

casts=[];magic={witch:100,orc:99};
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,['witch-house'],'an unaffordable orc spell does not block witch defence');
casts=[];magic={witch:100,orc:100};orcAI=false;
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,['witch-house'],'a disabled director must not cast');
casts=[];orcAI=true;witchAI=false;activeFire=true;
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,[],'a currently active spell interrupts new casts');
casts=[];activeFire=false;witchAI=true;activeDome=true;magic={witch:100,orc:0};
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,[],'active witch dome blocks another witch dome');
casts=[];activeDome=false;state.paused=true;
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,[],'paused games do not cast from either faction');
casts=[];state.paused=false;state.running=false;
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,[],'ended games do not cast');
casts=[];state.running=true;visible=false;
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,[],'enemies outside current fog cannot trigger autonomous spells');
visible=true;casts=[];house.destroyed=true;
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,[],'destroyed headquarters are never spell origins');
house.destroyed=false;
state.spellDecisionElapsed=0;
magic={witch:100,orc:100};orcCastResult=true;casts=[];
const fresh={witch:0,orc:0};magic=fresh;
defense.step(cycle.DEFENSE_INTERVAL);
assert.deepEqual(casts,[],'the spell service reads fresh match resources after reset');

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(html.includes('rts-spell-cycle.js'));
assert(game.includes('spellCycle.createDefense('));
assert(game.includes('spellCycle.advanceDome('));
assert(game.includes('spellCycle.applyDomeDamage('));
assert(game.includes('spellCycle.advanceFireRain('));
assert(game.includes('spellCycle.applyFireRainDamage('));
assert(game.includes('dealDamage(actor,actor.health,null)'),
  'the 3D composition root keeps its original death effects');
console.log('PASS spell cycle: cast priorities, cadence, fresh magic, sight, interruptions, radius and damage windows');
