import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-raven-distraction.js');

const actor={id:1,kind:'orc',role:'melee',profile:{sight:8},
  root:{position:{x:0,z:0}},route:{},weapon:true};
const bird={id:22,x:3,z:0};
const flock={ravens:[bird],nearestDecoy:(position,radius)=>{
  assert.equal(radius,6.7,'The decoy sensing radius remains capped');
  return bird;
}};
let modelLoaded=false,directorEnabled=true,visible=true,fighter=true;
let navigateResult='moving';
const events=[];
const decoy=create({roles:{isFighter:()=>fighter},ravenFlock:flock,
  fogOfWar:{visibleAt:(x,z,clan)=>{
    assert.equal(clan,'orc');return visible;
  }},isModelLoaded:()=>modelLoaded,
  isOrcDirectorEnabled:()=>directorEnabled,
  navigateActor:(unit,to,dt,mode)=>{
    events.push(['navigate',to.x,to.z,mode]);return navigateResult;
  },animation:(unit,clip)=>events.push(['animation',clip]),
  faceDirection:(unit,x,z)=>events.push(['face',x,z]),random:()=>.5});
assert(Object.isFrozen(decoy));
assert.equal(decoy.tick(actor,.1),false,'No behavior before bird models load');
assert.equal(actor.ravenCooldown,undefined);
modelLoaded=true;directorEnabled=false;
assert.equal(decoy.tick(actor,.1),false,'AI disabled means no opportunistic pursuit');
directorEnabled=true;fighter=false;
assert.equal(decoy.tick(actor,.1),false,'Workers do not chase decoys');
fighter=true;visible=false;
assert.equal(decoy.tick(actor,.1),false,'Fog blocks omniscient Raven chasing');
visible=true;
assert.equal(decoy.tick(actor,.1),true);
assert.deepEqual(actor.ravenDistraction,{id:22,remaining:4.3+.5*1.7-.1});
assert.equal(actor.ravenCooldown,11);
assert.equal(actor.route,null);
assert(events.some(e=>e[0]==='navigate'&&e[3]==='pursuit'));

// A moving bird can lure the Orc within reach without ever being attacked.
actor.root.position.x=2;
events.length=0;
assert.equal(decoy.tick(actor,.2),true);
assert(events.some(e=>e[0]==='face'));
assert(events.some(e=>e[1]==='Sword_Idle'));
assert.equal(bird.id,22);
assert.equal(flock.ravens.length,1,'The raven is never harmed or removed');

// A blocked pursuit releases its state, retains cooldown, then can start again.
actor.root.position.x=0;navigateResult='blocked';
assert.equal(decoy.tick(actor,.1),false);
assert.equal(actor.ravenDistraction,null);
assert.equal(actor.ravenCooldown,11);
assert.equal(decoy.tick(actor,.1),false,'Cooldown prevents instant re-acquisition');
navigateResult='moving';actor.ravenCooldown=0;
assert.equal(decoy.tick(actor,.1),true);
bird.x=20;
assert.equal(decoy.tick(actor,.1),false,'A far-away raven terminates the pursuit');
assert.equal(actor.ravenDistraction,null);

bird.x=3;actor.ravenCooldown=0;
assert.equal(decoy.tick(actor,6),false,'A distraction expires by its original timer');
actor.ravenCooldown=0;
flock.ravens.length=0;
assert.equal(decoy.tick(actor,.1),false,'Disappearing birds leave no ghost target');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(game.includes('window.FightersRavenDistraction.create('));
assert(game.includes('return ravenDistraction.tick(actor,dt)'));
console.log('PASS harmless Raven distractions: sight, roles, bounded chase, cooldown, navigation and disappearance.');
