import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {Engine}=require('../docs/rts-sound.js');

const manifest={sounds:[
  {category:'short',path:'short/Orc_04.mp3'},
  {category:'short',path:'short/Orc_06.mp3'},
  {category:'long',path:'long/Orc_00.mp3'},
  {category:'loud',path:'loud/Orc_05.mp3'},
  {category:'work',path:'work/Hammer.mp3'},
  {category:'short',path:'../../wrong.mp3'},
]};
let currentTime=1000,downloads=0,starts=0,stops=0;
const startedSources=[];
class FakeAudioContext{
  state='suspended';
  destination={};
  sampleRate=44100;
  resume(){this.state='running';return Promise.resolve();}
  suspend(){this.state='suspended';return Promise.resolve();}
  decodeAudioData(){return Promise.resolve({duration:.8});}
  createBuffer(channels,length){
    const samples=Array.from({length:channels},()=>new Float32Array(length));
    return {getChannelData:index=>samples[index]};
  }
  createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
  createBufferSource(){
    return {buffer:null,onended:null,playbackRate:{value:1},detune:{value:0},
      connect(){},disconnect(){},
      start(){starts++;startedSources.push(this);},
      stop(){stops++;this.onended?.();}};
  }
}
const fetcher=async url=>{
  if(url.endsWith('manifest.json'))return {ok:true,json:async()=>manifest};
  downloads++;
  return {ok:true,arrayBuffer:async()=>new ArrayBuffer(80)};
};
const engine=new Engine({fetcher,contextFactory:()=>new FakeAudioContext(),
  random:()=>0,now:()=>currentTime,maxActive:3,maxCached:1});
assert.equal(await engine.play('short',()=>true),false,'audio must stay locked before Start');
assert.equal(engine.unlock(),true);
await engine.load();
assert.deepEqual(engine.snapshot().available,{short:2,long:1,loud:1,work:1});
assert.equal(await engine.play('short',()=>false),false,'hidden Orc must never be heard');
assert.equal(downloads,0,'hidden Orc must not load an MP3');
assert.equal(engine.snapshot().visibilityBlocked,1);
assert.equal(await engine.play('short',()=>true),true);
assert.equal(starts,1);
assert.equal(engine.snapshot().active,1);
assert.equal(await engine.play('short',()=>true),false,'repeated orders must be throttled');
currentTime+=500;
assert.equal(await engine.play('short',()=>true),true);
assert.equal(engine.snapshot().active,2);
assert.equal(new Set(engine.cache.keys()).size,1,'LRU should be bounded');
assert.equal(downloads,2,'each non-repeating MP3 should decode once');
currentTime+=500;
assert.equal(await engine.play('loud',()=>true),true);
assert.equal(engine.snapshot().active,3);
assert.equal(engine.snapshot().cached,1,'cache must evict old buffers');
currentTime+=1000;
assert.equal(await engine.play('long',()=>true),false,'active voice count must be capped');
engine.setPaused(true);
assert.equal(await engine.play('short',()=>true),false,'paused game must be silent');
engine.setPaused(false);
engine.reset();
assert.equal(engine.snapshot().active,0,'reset must release every voice');
assert.equal(engine.snapshot().pending,0,'reset must clear pending work');
assert.equal(stops,3,'all active AudioBufferSources must stop on reset');
const synthesizerDownloads=downloads;
assert.equal(engine.playHammer(()=>false),false,'Unseen hammer strikes must be silent');
assert.equal(engine.playHammer(()=>true),true,'Hammer strike is synthesized on first use');
assert.equal(engine.snapshot().hammerSynthReady,true);
assert(engine.hammerBuffer.getChannelData(0).some(sample=>Math.abs(sample)>.05),
  'The hammer must contain a strong percussive transient');
assert.equal(engine.playHammer(()=>true),false,'Rapid strikes remain throttled');
assert.equal(downloads,synthesizerDownloads,'A hammer needs no remote MP3 download');
engine.reset();
assert.equal(engine.snapshot().active,0,'reset must also release the synthetic strike');
const beforeHammerDownloads=downloads;
assert.equal(await engine.play('work',()=>false),false,
  'unseen construction must not make noise');
assert.equal(downloads,beforeHammerDownloads,
  'an invisible construction must never download the hammer sample');
assert.equal(await engine.play('work',()=>true),true,
  'visible construction plays one real hammer impact');
assert.equal(await engine.play('work',()=>true),false,
  'multiple workers cannot spam the hammer category in one frame');
assert.equal(downloads,beforeHammerDownloads+1,
  'hammer MP3 is decoded only when needed');
engine.reset();

// Visibility is checked again after asynchronous MP3 retrieval. A unit may
// disappear into fog while its preview is still being fetched or decoded.
let resolveAudio;
let audible=true;
const deferred=new Engine({
  contextFactory:()=>new FakeAudioContext(),now:()=>10000,
  fetcher:async url=>url.endsWith('manifest.json')?
    {ok:true,json:async()=>manifest}:
    {ok:true,arrayBuffer:()=>new Promise(resolve=>{resolveAudio=resolve;})}
});
deferred.unlock();
await deferred.load();
const request=deferred.play('loud',()=>audible);
await new Promise(resolve=>setImmediate(resolve));
audible=false;
resolveAudio(new ArrayBuffer(80));
assert.equal(await request,false,'no audio after losing real-time visibility');
assert.equal(deferred.snapshot().played,0);
assert.equal(deferred.snapshot().active,0);

// Witch catalog intentionally has no destruction sound until the licensed
// Pixabay original is supplied. Pinned voice recordings remain fog-safe.
const witchManifest={sounds:[
  {category:'interaction',path:'interaction/Witch_Interaction.mp3'},
  {category:'interaction',path:'interaction/Yes_Excited.mp3'},
  {category:'interaction',path:'interaction/Uhu_Assured.mp3'},
  {category:'creation',path:'creation/Witch_Creation.mp3'},
  {category:'work',path:'work/Hammer.mp3'},
  {category:'destruction',path:'../unlicensed-preview.mp3'},
]};
const witch=new Engine({
  categories:['interaction','creation','destruction','work'],
  allowEmptyCategories:['destruction'],
  manifestUrl:'./sounds/witches/manifest.json',rootUrl:'./sounds/witches/',
  contextFactory:()=>new FakeAudioContext(),now:()=>10000,
  fetcher:async url=>url.endsWith('manifest.json')?
    {ok:true,json:async()=>witchManifest}:
    {ok:true,arrayBuffer:async()=>new ArrayBuffer(80)}
});
assert.equal(witch.unlock(),true);
await witch.load();
assert.deepEqual(witch.snapshot().available,{interaction:3,creation:1,destruction:0,work:1},
  'licensed Witch categories load, unsafe preview is not accepted');
assert.equal(await witch.play('interaction',()=>false),false,
  'an unseen Witch must be inaudible');
assert.equal(await witch.play('interaction',()=>true),true,
  'Witch selection and orders play a valid acknowledgement');
witch.reset();
assert.equal(await witch.play('interaction',()=>true,{
  path:'interaction/Uhu_Assured.mp3',playbackRate:.96,detuneCents:-25
}),true,'a Witch keeps her own uh-huh recording');
assert.equal([...witch.lastSound.values()].at(-1),'interaction/Uhu_Assured.mp3');
assert.equal(startedSources.at(-1).playbackRate.value,.96);
assert.equal(startedSources.at(-1).detune.value,-25);
witch.reset();
assert.equal(await witch.play('interaction',()=>true,{
  path:'../../evil.mp3',playbackRate:99,detuneCents:1000
}),true,'a non-manifest request safely falls back to the catalog');
assert.notEqual([...witch.lastSound.values()].at(-1),'../../evil.mp3');
assert.equal(startedSources.at(-1).playbackRate.value,1.12);
assert.equal(startedSources.at(-1).detune.value,100);
witch.reset();
assert.equal(await witch.play('creation',()=>true),true,
  'Witch training plays the laugh');
assert.equal(await witch.play('work',()=>true),true,
  'Witch construction reuses the short CC0 hammer effect');
assert.equal(await witch.play('destruction',()=>true),false,
  'missing licensed death asset must fail silently');
assert.equal(witch.snapshot().loadErrors,0,'missing optional Witch sound is not a network error');
witch.reset();
witch.context.state='suspended';
assert.equal(witch.snapshot().contextState,'suspended');
assert.equal(await witch.play('interaction',()=>true),false,
  'browser suspension must not attempt silent playback');
assert.equal(witch.resumeFromGesture(),true,'user interaction should resume audio');
assert.equal(witch.snapshot().contextState,'running');
assert.equal(await witch.play('interaction',()=>true),true,
  'voice must become playable again after browser suspension');
witch.reset();
assert.equal(witch.snapshot().active,0);

// All fifteen shuffled Witch identities must refer to a source slated for
// import. A source can have two nuanced persona variants, never a new random
// recording on each selection.
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const importer=readFileSync(new URL('./import-witch-voices.py',import.meta.url),'utf8');
const presetBlock=html.match(/const WITCH_VOICE_PRESETS=Object.freeze\(\[([\s\S]*?)\]\);/)?.[1];
assert(presetBlock,'witch voice persona catalog must exist');
const presets=[...presetBlock.matchAll(/path:'interaction\/([A-Za-z][A-Za-z0-9_-]*)\.mp3',rate:([\d.]+),cents:([-\d]+)/g)];
assert.equal(presets.length,15,'exactly fifteen voice identities');
assert.equal(new Set(presets.map(p=>p[1])).size,10,'ten distinct source recordings');
for(const [,name,rate,cents] of presets){
  assert(importer.includes(`("${name}",`),`missing licensed source for ${name}`);
  assert(+rate>=.94&&+rate<=1.05,'persona speed must be subtle');
  assert(Math.abs(+cents)<=45,'persona pitch must be subtle');
}
assert(html.includes('shuffledDraw(witchVoiceDeck,WITCH_VOICE_PRESETS)'),
  'witch voice is assigned once when she spawns');

console.log('PASS RTS sound engines: Orc random pools and fog; Witch categories, iOS resume, visibility, pause, reset and bounded memory.');
