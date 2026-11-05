import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';

const expected={
  witches:['worker','guard','arcane','elder'],
  orcs:['worker','warrior','shaman','brute']
};
const supported={creation:5,interaction:4,attack:4};
for(const [faction,voices] of Object.entries(expected)){
  const dir=join('docs','sounds',faction);
  const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
  const utterances=manifest.sounds.filter(s=>s.model==='qwen/qwen3-tts');
  assert.equal(utterances.length,52,`${faction}: 52 new lines expected`);
  assert.deepEqual(manifest.voice_roles,voices);
  const paths=new Set();
  for(const sound of utterances){
    assert(voices.includes(sound.voice),`${faction}: invalid role ${sound.voice}`);
    assert(Object.hasOwn(supported,sound.category),`${faction}: invalid category`);
    assert(/^[a-z]+\/[a-z]+_\d{2}\.mp3$/.test(sound.path),`${faction}: bad path`);
    assert(!paths.has(sound.path),`${faction}: duplicated MP3 path`);
    paths.add(sound.path);
    assert(sound.text?.trim(),`${faction}: blank phrase`);
    assert(statSync(join(dir,sound.path)).size>2000,`${faction}: missing MP3`);
    if(sound.category==='attack')
      assert(/shout|battle-cry/.test(sound.performance),
        `${faction}: attack not created as a shouted performance`);
  }
  for(const voice of voices){
    for(const [category,count] of Object.entries(supported)){
      const pool=utterances.filter(s=>s.voice===voice&&s.category===category);
      assert.equal(pool.length,count,`${faction}: ${voice}/${category} incomplete`);
      for(let n=1;n<=count;n++)
        assert(pool.some(s=>s.path===`${category}/${voice}_${String(n).padStart(2,'0')}.mp3`));
    }
  }
  const work=manifest.sounds.filter(s=>s.category==='work');
  assert.equal(work.length,1,`${faction}: existing hammer effect must survive`);
  assert(existsSync(join(dir,work[0].path)));
  if(faction==='orcs'){
    assert(manifest.sounds.some(s=>s.category==='loud'),
      'existing Orc death grunts must survive');
    assert(!manifest.sounds.some(s=>['short','long'].includes(s.category)));
  }else{
    assert(!manifest.sounds.some(s=>s.path?.includes('Yes_')||
      s.path?.includes('Uhu_')),'erratic Witch voices are retired');
    for(const voice of voices){
      const agreed=utterances.find(s=>s.path===`attack/${voice}_02.mp3`);
      assert.equal(agreed.performance,'approved-direct-voice-design-shout',
        `the approved ${voice} "For the Wiccans!" must be preserved exactly`);
    }
  }
}
console.log('PASS 104 pre-generated role-based voices (5 creation, 4 selection, 4 attack × 4 voices × 2 factions)');
