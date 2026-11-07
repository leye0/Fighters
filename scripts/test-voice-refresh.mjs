import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

const phraseCounts={creation:5,interaction:4,attack:4};
const roleNames={
  witches:['worker','guard','arcane','elder'],
  orcs:['worker','warrior','shaman','brute']
};
for(const [faction,roles] of Object.entries(roleNames)){
  const directory=join('app','sounds',faction);
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  const generated=manifest.sounds.filter(s=>Object.hasOwn(phraseCounts,s.category));
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
    assert(['ffmpeg-rubberband','ffmpeg-rate-and-atempo']
      .includes(manifest.dialogue_processing?.method));
    assert.equal(manifest.dialogue_processing.pitch_factor,.75);
    assert.equal(manifest.dialogue_processing.original_revision,
      '9b8239db721835042a5a217006256dfb4d4cb675');
    assert.equal(manifest.dialogue_processing.tempo_factor,1);
    assert.equal(manifest.dialogue_processing.processed_clips,52);
  }else{
    assert.equal(manifest.generator,'minimax/speech-02-turbo');
    assert.equal(Object.keys(manifest.stable_voice_identities||{}).length,4);
    assert.equal(new Set(Object.values(manifest.stable_voice_identities)
      .map(identity=>identity.voice_id)).size,4);
    for(const role of roles){
      const roleLines=generated.filter(s=>s.voice===role);
      const identity=manifest.stable_voice_identities[role];
      assert.equal(roleLines.length,13);
      assert.match(identity.approved_shout_sha256,/^[a-f0-9]{64}$/);
      assert(identity.reference_seconds>=10,
        'the cloned role identity must have a full-length reference');
      for(const line of roleLines){
        assert.equal(line.voice_id,identity.voice_id,
          'all greetings, selections and battle cries use ONE permanent voice');
        assert.equal(line.voice_reference_sha256,identity.approved_shout_sha256);
        assert.equal(line.model,'minimax/speech-02-turbo');
        assert.equal(line.performance,line.category==='attack'?
          'consistent-role-battle-cry':'consistent-role-character-voice');
      }
    }
  }
}
console.log('PASS: four permanent Witch voice IDs across 52 different 5/4/4 phrases, Orc pitch lowered at unchanged tempo.');
