import assert from 'node:assert/strict';
import {changedPathsRequireRebuild,isRuntimeAssetBuildInput} from './runtime-asset-changes.mjs';

for(const source of [
  'assets/runtime-rebuild.request',
  'package-lock.json',
  'witch_house.glb',
  'crops_low_poly.glb',
  'orc_rts_building_set_-_proto_series.glb.part1',
  'orc_rts_building_set_-_proto_series.glb.part2',
  'scripts/prepare-runtime-assets.sh',
  'scripts/fetch-pinned-humans.sh',
  'scripts/download-costumes.sh',
  'scripts/download-sword.sh',
  'scripts/pack-hair-long.mjs',
  'scripts/decompress-sword.mjs'
]) assert(isRuntimeAssetBuildInput(source),`${source} must request a new archive`);

for(const ordinary of [
  'docs/game.js',
  'docs/rts-visibility-cycle.js',
  'docs/models/forest/oak.glb',
  'docs/sounds/effects/attack.mp3',
  'assets/runtime-assets.lock',
  '.github/workflows/browser-qa.yml',
  'scripts/runtime-asset-changes.mjs',
  'refactor.md'
]) assert(!isRuntimeAssetBuildInput(ordinary),`${ordinary} must reuse the pinned archive`);

assert(changedPathsRequireRebuild(['docs/game.js','scripts/download-sword.sh']));
assert(!changedPathsRequireRebuild(['docs/game.js','assets/runtime-assets.lock']));
assert(!changedPathsRequireRebuild([]));
console.log('PASS exceptional source changes rebuild; ordinary QA and Pages reuse the pinned archive.');
