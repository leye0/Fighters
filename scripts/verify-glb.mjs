#!/usr/bin/env node
/**
 * Exact binary and glTF 2.0 structural verification for the two Quaternius GLBs.
 * No retargeting, no third-party parser and no downloaded npm dependencies.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const expected = {
  'human_male.glb': 'ad6e0e84b934007d2bc89acf2ebb947a79738333',
  'human_female.glb': 'd3ebcbbcd14bb742b2962687640e36ee95977e3f'
};
const required = ['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop',
  'Punch_Jab','Punch_Cross','Melee_Hook',
  'Hit_Chest','Death01'];
// Weapon animations already embedded in BOTH pinned 65-bone GLBs. This
// verifies their source clips only; it does not certify any 3D weapon grip.
const armedClips = {
  sword: ['Sword_Idle','Sword_Attack','Sword_Block','Sword_Dash',
    'Sword_Regular_A','Sword_Regular_A_Rec','Sword_Regular_B','Sword_Regular_B_Rec',
    'Sword_Regular_C','Sword_Regular_Combo','Sword_Heavy_Combo'],
  pistol: ['Pistol_Idle_Loop','Pistol_Aim_Neutral','Pistol_Aim_Up',
    'Pistol_Aim_Down','Pistol_Shoot','Pistol_Reload']
};
function assert(value, reason) { if (!value) throw Error(reason); }
function check(path) {
  const bytes = readFileSync(path);
  const filename = path.split(/[\\/]/).at(-1);
  assert(expected[filename], 'Unknown model: ' + filename);
  const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  assert(sha === expected[filename], filename + ': upstream blob integrity mismatch ' + sha);
  assert(bytes.toString('ascii',0,4) === 'glTF', filename + ': not GLB');
  assert(bytes.readUInt32LE(4) === 2, filename + ': GLB version != 2');
  assert(bytes.readUInt32LE(8) === bytes.length, filename + ': invalid GLB length');
  const jsonSize = bytes.readUInt32LE(12);
  assert(bytes.readUInt32LE(16) === 0x4e4f534a, filename + ': missing JSON chunk');
  const gltf = JSON.parse(bytes.subarray(20,20+jsonSize).toString('utf8'));
  assert(gltf.asset?.version === '2.0', filename + ': not glTF 2.0');
  assert((gltf.meshes?.length || 0)>0, filename + ': no mesh');
  assert((gltf.skins?.length || 0)>0, filename + ': no rig');
  assert((gltf.animations?.length || 0)===86, filename + ': expected 86 animations');
  const skins = new Set(gltf.skins.flatMap(s=>s.joints));
  assert(skins.size >= 20, filename + ': implausibly small skeleton');
  const clipNames = new Set(gltf.animations.map(clip => clip.name));
  for (const name of required) assert(clipNames.has(name), filename + ': missing '+name);
  for (const [category, names] of Object.entries(armedClips))
    for (const name of names) assert(clipNames.has(name), filename + ': missing '+category+' clip '+name);
  let channels = 0;
  for (const clip of gltf.animations) {
    assert(clip.channels?.length >= 20, filename + ': insufficient channels '+clip.name);
    for (const channel of clip.channels) {
      const target = channel.target;
      assert(Number.isInteger(target?.node) && gltf.nodes[target.node], filename + ': foreign joint '+clip.name);
      assert(channel.sampler >= 0 && clip.samplers[channel.sampler], filename + ': missing sampler '+clip.name);
      const sample = clip.samplers[channel.sampler];
      assert(gltf.accessors[sample.input] && gltf.accessors[sample.output], filename + ': missing keyframes '+clip.name);
      channels++;
    }
  }
  console.log(JSON.stringify({file:filename,bytes:bytes.length,animations:gltf.animations.length,
    joints:skins.size,channels,duplicateNames:86-new Set(gltf.animations.map(a=>a.name)).size,
    sha,weaponClips:Object.fromEntries(Object.entries(armedClips).map(([kind,names])=>[kind,names.length])),integrity:'PASS'},null,2));
}
const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/verify-glb.mjs path/to/human_male.glb path/to/human_female.glb');
  process.exit(2);
}
for (const file of files) check(file);