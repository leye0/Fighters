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

// The game uses one stable timbre per role; events vary within that role.
// Attack orders must use the battle-cry pool, never the quiet acknowledgement.
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(html.includes("categories:['interaction','creation','attack','loud','work']"),
  'Orc battle cries are loaded alongside the death-grunt effects');
assert(html.includes("categories:['interaction','creation','attack','destruction','work']"),
  'Witch battle cries are loaded');
assert(html.includes("acknowledgePlayerOrder(actors.filter(actor=>actor.attackOrder===target),'attack')"),
  'attack commands must trigger forceful speech');
assert(!html.includes('WITCH_VOICE_PRESETS'),
  'unpredictable old Freesound Witch acknowledgements are retired');
assert(html.includes('const voiceLineIndex=1+Math.floor(Math.random()*4)'),
  'existing Orcs keep their previously approved stable recording');
assert(html.includes('voice:ROLE_VOICE.witch[actor.role],unitId:actor.id'),
  'Witches must cycle phrases per actor ID in a stable role voice');
assert(html.includes('voice:ROLE_VOICE.orc[actor.role],variant:actor.voiceLineIndex'),
  'Orcs retain their recording while its pitch is lowered');
assert(html.includes("assetVersion:'deep-orcs-20261105'"),
  'retuned Orc MP3s must bypass older browser caches');
for(const [faction,roles] of Object.entries({
  witch:['worker','guard','arcane'],orc:['worker','warrior','shaman']
})){
  for(const role of roles)assert(html.includes(`${role}:'${role}'`)||
    html.includes(`:'${role}'`),`missing ${faction} voice ${role}`);
}

const voices={sounds:[
  {category:'interaction',path:'interaction/worker_01.mp3',voice:'worker'},
  {category:'interaction',path:'interaction/worker_02.mp3',voice:'worker'},
  {category:'interaction',path:'interaction/worker_03.mp3',voice:'worker'},
  {category:'interaction',path:'interaction/worker_04.mp3',voice:'worker'},
  {category:'interaction',path:'interaction/guard_01.mp3',voice:'guard'},
  {category:'attack',path:'attack/worker_01.mp3',voice:'worker'},
  {category:'attack',path:'attack/worker_02.mp3',voice:'worker'},
  {category:'attack',path:'attack/worker_03.mp3',voice:'worker'},
  {category:'attack',path:'attack/worker_04.mp3',voice:'worker'},
  {category:'attack',path:'attack/guard_01.mp3',voice:'guard'},
  ...Array.from({length:5},(_,i)=>({category:'creation',
    path:`creation/worker_0${i+1}.mp3`,voice:'worker'})),
]};
let time=50000;
const roleEngine=new Engine({categories:['interaction','attack','creation'],
  contextFactory:()=>new FakeAudioContext(),now:()=>time,random:()=>0,
  maxActive:35,assetVersion:'deep-orcs-20261105',
  fetcher:async url=>url.endsWith('manifest.json')?
    {ok:true,json:async()=>voices}:
    {ok:true,arrayBuffer:async()=>new ArrayBuffer(80)}
});
roleEngine.unlock();await roleEngine.load();
assert.equal(roleEngine.phraseDecks.size,0);
assert.equal(await roleEngine.play('interaction',()=>true,{voice:'guard'}),true);
assert.equal(roleEngine.lastSound.get('interaction:guard'),'interaction/guard_01.mp3');
time+=500;
assert.equal(await roleEngine.play('interaction',()=>true,{voice:'worker'}),true);
assert.equal(roleEngine.lastSound.get('interaction:worker'),'interaction/worker_01.mp3');
time+=500;
assert.equal(await roleEngine.play('interaction',()=>true,{voice:'worker'}),true);
assert.equal(roleEngine.lastSound.get('interaction:worker'),'interaction/worker_02.mp3',
  'one role rotates its four phrases without repeating the immediately previous one');
time+=500;
assert.equal(await roleEngine.play('attack',()=>true,{voice:'guard'}),true);
assert.equal(roleEngine.lastSound.get('attack:guard'),'attack/guard_01.mp3');
time+=700;
assert.equal(await roleEngine.play('attack',()=>true,{voice:'elder'}),false,
  'unknown voice must stay silent rather than playing another role');
roleEngine.reset();
time+=700;
const selections=[];
for(let i=0;i<9;i++){
  time+=500;
  assert.equal(await roleEngine.play('interaction',()=>true,{voice:'worker',unitId:17}),true);
  selections.push(roleEngine.lastSound.get('interaction:worker'));
}
assert.equal(new Set(selections.slice(0,4)).size,4,
  'one Witch speaks all four selection phrases before any repeats');
assert.equal(new Set(selections.slice(4,8)).size,4,
  'the second deck must also contain all four phrases');
for(let i=1;i<selections.length;i++)
  assert.notEqual(selections[i],selections[i-1],
    'no immediate repetition, including at the deck rollover');
const attacks=[];
for(let i=0;i<4;i++){
  time+=700;
  assert.equal(await roleEngine.play('attack',()=>true,{voice:'worker',unitId:17}),true);
  attacks.push(roleEngine.lastSound.get('attack:worker'));
}
assert.equal(new Set(attacks).size,4,'all four battle cries must be available');
const greetings=[];
for(let i=0;i<5;i++){
  time+=1100;
  assert.equal(await roleEngine.play('creation',()=>true,{voice:'worker',unitId:17}),true);
  greetings.push(roleEngine.lastSound.get('creation:worker'));
}
assert.equal(new Set(greetings).size,5,'all five greetings must be available');
time+=1100;
assert.equal(await roleEngine.play('interaction',()=>true,{voice:'worker',unitId:18}),true);
assert.equal(roleEngine.phraseDecks.size,4,
  'each character and event uses its own separate phrase deck');
roleEngine.forgetUnit(17);
assert.equal(roleEngine.phraseDecks.size,1,
  'the deceased unit releases its voice decks without clearing another voice');
assert(roleEngine.phraseDecks.has('interaction:worker:18'),
  'surviving characters keep their own phrase rotation');
time+=500;
assert.equal(await roleEngine.play('interaction',()=>true,{voice:'worker',variant:2}),true);
assert.equal(roleEngine.lastSound.get('interaction:worker'),'interaction/worker_02.mp3',
  'an Orc-style explicit pinned recording still works');
time+=500;
assert.equal(await roleEngine.play('attack',()=>true,{voice:'guard',variant:1}),true);
assert.equal(roleEngine.lastSound.get('attack:guard'),'attack/guard_01.mp3');
time+=700;
assert.equal(await roleEngine.play('attack',()=>true,{voice:'guard',variant:99}),false,
  'an invalid pinned voice must not silently switch to another performer');
roleEngine.reset();
assert.equal(roleEngine.phraseDecks.size,0,'reset releases every actor phrase deck');

console.log('PASS RTS sound engines: 5/4/4 Witch phrases per role identity, pinned Orc voices, fog, iOS, and bounded memory.');
