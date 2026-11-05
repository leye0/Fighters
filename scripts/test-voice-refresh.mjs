import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

const phraseCounts={creation:5,interaction:4,attack:4};
const roleNames={
  witches:['worker','guard','arcane','elder'],
  orcs:['worker','warrior','shaman','brute']
};
for(const [faction,roles] of Object.entries(roleNames)){
  const directory=join('docs','sounds',faction);
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  const generated=manifest.sounds.filter(s=>s.model==='qwen/qwen3-tts');
  assert.equal(generated.length,52,`${faction}: exactly 52 spoken phrases`);
  for(const role of roles){
    for(const [category,count] of Object.entries(phraseCounts)){
      const lines=generated.filter(s=>s.voice===role&&s.category===category);
      assert.equal(lines.length,count,`${faction}: ${role} ${category}`);
      assert.equal(new Set(lines.map(s=>s.text)).size,count,
        `${faction}: ${role} ${category} must have ${count} distinct phrases`);
      for(const line of lines)
        assert(statSync(join(directory,line.path)).size>2000);
    }
  }
  if(faction==='orcs'){
    assert.equal(manifest.dialogue_processing?.method,'ffmpeg-rubberband');
    assert.equal(manifest.dialogue_processing.pitch_factor,.72);
    assert.equal(manifest.dialogue_processing.tempo_factor,1);
    assert.equal(manifest.dialogue_processing.processed_clips,52);
  }else{
    assert.equal(manifest.battle_voice_clone?.generated_clips,12);
    for(const role of roles){
      const anchor=generated.find(s=>s.path===`attack/${role}_02.mp3`);
      assert.equal(anchor.performance,'approved-direct-voice-design-shout',
        'the original approved shouted take must be preserved');
      const hash=createHash('sha256').update(
        readFileSync(join(directory,anchor.path))).digest('hex');
      assert.equal(manifest.battle_voice_clone.identity_by_role[role],hash);
      for(const line of generated.filter(s=>s.voice===role&&s.category==='attack'&&s!==anchor)){
        assert.equal(line.performance,'battle-cry-cloned-from-approved-role-voice',
          'all additional shouts must derive from the same approved vocal reference');
        assert.equal(line.battle_voice_reference_sha256,hash);
      }
      for(const line of generated.filter(s=>s.voice===role&&
        (s.category==='creation'||s.category==='interaction')))
        assert.equal(line.performance,'approved-character-voice',
          'preserve the approved same-reference Witch conversational recordings');
    }
  }
}
console.log('PASS: 4 Witch identities, 5/4/4 distinct phrases per role, shared battle shout anchors, pitch-lowered Orcs at unchanged tempo.');
