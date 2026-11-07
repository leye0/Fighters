// The normal browser QA owns both pinned restore and exceptional asset builds.
// Only inputs of prepare-runtime-assets.sh may trigger an expensive rebuild.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const buildInputs=new Set([
  'assets/runtime-rebuild.request',
  'package.json',
  'package-lock.json',
  'crops_low_poly.glb',
  'witch_house.glb',
  'scripts/prepare-runtime-assets.sh',
  'scripts/build-runtime-crops.mjs',
  'scripts/split-orc-buildings.mjs',
  'scripts/generate-building-footprints.mjs',
  'scripts/union-xz-triangles.py',
  'scripts/fetch-pinned-humans.sh',
  'scripts/compress-character-assets.sh',
  'scripts/build-runtime-characters.mjs',
  'scripts/download-costumes.sh',
  'scripts/pack-hair-long.mjs',
  'scripts/download-sword.sh',
  'scripts/decompress-sword.mjs'
]);

export function isRuntimeAssetBuildInput(path){
  return buildInputs.has(path)||
    /^orc_rts_building_set_-_proto_series\.glb\.part[0-9]+$/.test(path);
}

export function changedPathsRequireRebuild(paths){
  return paths.some(isRuntimeAssetBuildInput);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [before,after]=process.argv.slice(2);
  if(!before||!after) throw new Error('Usage: runtime-asset-changes.mjs BEFORE_SHA AFTER_SHA');
  if(!/^[a-f0-9]{40}$/.test(before)||!/^[a-f0-9]{40}$/.test(after)){
    throw new Error('Expected two full Git commit SHAs');
  }
  const changed=before==='0'.repeat(40)
    ? ['assets/runtime-rebuild.request']
    : execFileSync('git',['diff','--name-only',before,after],{encoding:'utf8'})
      .trim().split('\n').filter(Boolean);
  console.log(changedPathsRequireRebuild(changed)?'true':'false');
}
