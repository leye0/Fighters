import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const sim=require('../app/rts-simulation.js');
assert.equal(sim.FIXED_DT,1/60);
assert.equal(sim.MAX_TICKS_PER_FRAME,12);
const phases=[],steps=[];
let active=false;
const step=sim.createStepper(()=>active,[
  ['production',dt=>phases.push(['production',dt])],
  ['movement',dt=>phases.push(['movement',dt])],
  ['fog',dt=>phases.push(['fog',dt])]
]);
step(sim.FIXED_DT);
assert.equal(phases.length,0,'paused sessions cannot change the simulation');
active=true;
let leftover=sim.advanceFrame(0,sim.FIXED_DT*2.5,dt=>{
  steps.push(dt);step(dt);
});
assert.equal(steps.length,2,'one frame runs two exact fixed ticks');
assert.deepEqual(phases.map(phase=>phase[0]),
  ['production','movement','fog','production','movement','fog']);
assert(phases.every(phase=>phase[1]===sim.FIXED_DT));
assert(Math.abs(leftover-sim.FIXED_DT*.5)<1e-9);
// Permit the same floating-point remainder behaviour as the original loop.
leftover=sim.advanceFrame(leftover,sim.FIXED_DT*.500001,()=>steps.push(0));
assert.equal(steps.length,3,'leftover fraction carries to next frame');
assert(leftover<1e-7);
let capped=0;
leftover=sim.advanceFrame(0,100,()=>capped++);
assert.equal(capped,12,'a stalled tab never schedules unbounded catch-up work');
assert.equal(leftover,0,'overrun is discarded just as before');
assert.throws(()=>sim.createStepper(()=>true,[['bad']]),/Invalid/);
const html=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
assert(html.includes('window.FightersSimulation.createStepper('));
assert(html.includes('window.FightersSimulation.advanceFrame('));
assert(html.includes('if(qaMode)window.__fightersQA={'),
  'the QA-only control interface must not be installed for players');
const entry=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(entry.includes('<script type="module" src="./game.js"></script>'));
assert(!entry.includes('<script type="module">'),
  'the playable HTML must remain a small bootstrap without the game monolith');
console.log('PASS ordered RTS simulation stages and bounded 60Hz frame scheduling');
