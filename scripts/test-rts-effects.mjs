import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {Engine,PATHS,EFFECTS}=require('../app/rts-effects.js');

let clock=1000,downloads=0,starts=0,stops=0;
const sources=[];
const node=()=>({connections:[],connect(target){this.connections.push(target);},
  disconnect(){this.connections=[];}});
const parameter=(value=0)=>({value,setTargetAtTime(v){this.value=v;}});
class FakeContext{
  state='running';sampleRate=22050;currentTime=4;destination=node();
  createGain(){return {...node(),gain:parameter(1)};}
  createDelay(){return {...node(),delayTime:parameter()};}
  createBiquadFilter(){return {...node(),frequency:parameter()};}
  createStereoPanner(){return {...node(),pan:parameter()};}
  createBuffer(channels,length){
    const data=Array.from({length:channels},()=>new Float32Array(length));
    return {getChannelData:index=>data[index],duration:length/this.sampleRate};
  }
  decodeAudioData(){return Promise.resolve({duration:.65});}
  createBufferSource(){
    const source={...node(),buffer:null,onended:null,playbackRate:parameter(1),
      start(){starts++;sources.push(this);},
      stop(){stops++;this.onended?.();}};
    return source;
  }
}
const context=new FakeContext();
let listener={x:0,z:0},visible=true;
const engine=new Engine({contextFactory:()=>context,listener:()=>listener,
  now:()=>clock,random:()=>0,maxActive:3,maxCached:3,maxPending:2,
  fetcher:async()=>{downloads++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(40)};}});
assert.deepEqual(PATHS.swordHit.length,4);
assert.deepEqual(PATHS.caw.length,3);
assert.deepEqual(PATHS.swordSwing.length,2);
assert.deepEqual(PATHS.dome,['dome/wiccans-chorus.mp3']);
assert.equal(EFFECTS.dome.global,true);
assert(EFFECTS.magic.priority>EFFECTS.garden.priority);
assert.equal(await engine.play('swordHit',{x:0,z:0}),false,'locked until Start');
assert.equal(engine.unlock(),true);
await engine.warmup();
engine.reset();
const before=downloads;
assert.equal(await engine.play('hammer',{x:0,z:0},()=>false),false);
assert.equal(downloads,before,'fog must suppress even the fetch');
assert.equal(await engine.play('hammer',{x:40,z:0}),false,'out of range');
assert.equal(downloads,before,'far effects never download');
assert.equal(await engine.play('hammer',{x:2,z:0}),true);
assert.equal(await engine.play('hammer',{x:2,z:0}),false,'impacts are throttled');
assert.equal(engine.snapshot().active,1);
clock+=500;
assert.equal(await engine.play('mine',{x:4,z:0}),true,'mining is independent of hammer');
clock+=500;
assert.equal(await engine.play('garden',{x:4,z:0}),true);
assert.equal(engine.snapshot().active,3);
clock+=500;
assert.equal(await engine.play('swordHit',{x:4,z:0}),true,
  'combat can steal a low-priority gardening voice when busy');
assert.equal(engine.snapshot().active,3);
assert.equal(engine.snapshot().voiceStolen,1);
listener={x:100,z:0};engine.update();
assert(engine.snapshot().active<3,'distant live sources fade out and release');
engine.reset();
assert.equal(engine.snapshot().active,0);
assert(stops>=3,'reset explicitly stops sources');

clock+=1000;
assert.equal(await engine.play('magic',{x:0,z:0}),false,'listener distance still applies');
listener={x:0,z:0};
assert.equal(await engine.play('magic',{x:0,z:0}),true);
const magic=engine.cache.get('magic/0');
assert(magic.getChannelData(0).some(value=>Math.abs(value)>.01),
  'magic launch must contain an audible, non-empty airy waveform');
engine.reset();clock+=1000;
assert.equal(await engine.play('caw',{x:14,z:0}),true);
const cawVoice=[...engine.active][0];
assert(cawVoice.send?.gain.value>0,'distant crow has filtered echo send');
assert(cawVoice.pan.pan.value>0,'crow is stereo-panned toward its position');
const nearGain=cawVoice.gain.gain.value;
listener={x:13,z:0};clock+=120;engine.update();
assert(cawVoice.gain.gain.value>nearGain,'closer crow grows louder in flight');
assert.equal(cawVoice.send.gain.value,0,'close crow loses the distant echo');
visible=false;clock+=1100;
assert.equal(await engine.play('caw',{x:14,z:0},()=>visible),false);
engine.setPaused(true);clock+=1100;
assert.equal(await engine.play('wing',{x:14,z:0}),false);
engine.setPaused(false);engine.reset();
assert.equal(engine.snapshot().active,0);
listener={x:100,z:100};clock+=1100;
assert.equal(await engine.play('dome',{x:-23.5,z:-17.5}),true,
  'the house incantation must be heard regardless of camera distance');
const domeVoice=[...engine.active][0];
clock+=200;engine.update();
assert(engine.active.has(domeVoice),'the global chorus must not be distance-culled');
engine.reset();
assert(engine.snapshot().cached<=3,'decoded buffers obey the LRU limit');
const htmlPath=new URL('../app/game.js',import.meta.url);
if(existsSync(htmlPath)){
  const html=readFileSync(htmlPath,'utf8')+'\n'+
    readFileSync(new URL('../app/rts-unit-tick.js',import.meta.url),'utf8')+'\n'+
    readFileSync(new URL('../app/rts-mining-cycle.js',import.meta.url),'utf8')+'\n'+
    readFileSync(new URL('../app/rts-garden-worker-cycle.js',import.meta.url),'utf8');
  for(const event of ['hammer','mine','swordHit','swordSwing','magic','garden','wing','caw'])
    assert(html.includes(`playEffect('${event}'`),`${event} has no gameplay trigger`);
  assert(html.includes('effects.update()'),'spatial motion must update in the game loop');
  assert(html.includes('effects.setPaused(session.paused)'),
    'pausing via the current session state must silence effects');
  assert(html.includes('effects.reset()'),'restart must release all active sounds');
  assert(html.includes('contextFactory:()=>orcSound.context'),
    'dialogue and effects must share one mobile-friendly AudioContext');
}
console.log('PASS RTS effects: material samples, sword/magic, crow echo, fog, budgets, pause, reset.');
