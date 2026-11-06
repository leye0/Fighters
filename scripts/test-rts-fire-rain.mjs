import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import fire from '../docs/rts-fire-rain.js';
import defense from '../docs/rts-spell-defense.js';
import dome from '../docs/rts-witch-dome.js';

const hut={type:'hut',clanId:'orcs',level:3,destroyed:false};
assert.equal(fire.RADIUS,dome.RADIUS);
assert.equal(fire.COST,dome.COST);
assert.equal(fire.canCast(hut,100),true);
for(const value of [0,50,99.9])assert.equal(fire.canCast(hut,value),false);
assert.equal(fire.canCast({...hut,level:2},100),false);
assert.equal(fire.canCast({...hut,destroyed:true},100),false);
assert.equal(fire.canCast({...hut,clanId:'witch'},100),false);
assert.equal(fire.canCast({...hut,type:'barrack'},100),false);
assert.equal(fire.canCast(hut,100,{faction:'witch'}),false);
assert.equal(fire.canCast(hut,100,{active:true}),false);
assert.equal(fire.canCast(hut,100,{paused:true}),false);
assert.equal(fire.canCast(hut,100,{running:false}),false);
assert.equal(fire.impactRadiusAt(.1),0);
assert.equal(fire.impactRadiusAt(2),20);
assert.equal(fire.inRange({x:0,z:0},{x:20,z:0},20),true);
assert.equal(fire.inRange({x:0,z:0},{x:20.1,z:0},20),false);

const actor=(kind,role,x,z,health=undefined)=>({kind,role,root:{position:{x,z}},
  ...(health===undefined?{}:{health,maxHealth:100})});
const base={center:{x:0,z:0},radius:20};
const defenders=[actor('orc','melee',1,2),actor('orc','worker',2,2)];
const threat=[...defenders,actor('witch','melee',2,5),actor('witch','ranged',4,5),
  actor('witch','melee',6,5)];
const result=defense.assess({...base,faction:'orc',units:threat});
assert.equal(result.threatened,true,'technically superior witches force an orc firestorm');
assert(result.enemyPower>result.friendlyPower*defense.THREAT_RATIO);
assert.equal(defense.assess({...base,faction:'orc',units:[...defenders,
  actor('witch','ranged',2,2)]}).threatened,false,'a lone unit is not an army');
assert.equal(defense.assess({...base,faction:'orc',units:threat,
  visible:()=>false}).threatened,false,'the orcs must actually see the attackers');
assert.equal(defense.assess({...base,faction:'orc',units:[...threat,
  ...Array.from({length:8},(_,i)=>actor('orc','melee',i,0))]}).threatened,false);
assert.equal(defense.assess({...base,faction:'orc',units:threat.map(u=>
  u.kind==='witch'?{...u,root:{position:{x:35,z:0}}}:u)}).threatened,false,
  'out-of-range attacks must not exhaust magic');
const reverse=defense.assess({...base,faction:'witch',units:[
  actor('witch','melee',1,1),actor('orc','melee',3,3),
  actor('orc','ranged',3,4),actor('orc','melee',4,3)]});
assert.equal(reverse.threatened,true,'witch AI must use exactly the same intelligence');
assert(defense.power(actor('witch','ranged',0,0))>
  defense.power(actor('witch','worker',0,0)));

const game=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
for(const item of ['castFireRain(','stepFireRain(dt)','stepSpellDefense(dt)',
  "effects.play('fireRain'",'Pluie de feu','orcMagic=soulRules.magicAfterTime',
  'castWitchDome(home,{byAI:true})'])assert(game.includes(item),item);
const sound=new URL('../docs/sounds/effects/fire-rain/meteor-storm.mp3',import.meta.url);
assert(existsSync(sound)&&statSync(sound).size>40000,'real-recording mix is bundled');
console.log('PASS firestorm: same 20-unit radius, 100 magic, real sound, symmetric sight-limited AI');
