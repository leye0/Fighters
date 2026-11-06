import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
const expected={
  '@gltf-transform/core':'4.2.1',
  '@gltf-transform/extensions':'4.2.1',
  '@gltf-transform/functions':'4.2.1',
  meshoptimizer:'0.25.0',
  sharp:'0.34.4',
  three:'0.180.0'
};
assert.equal(manifest.private,true,'Build tooling must not be published to npm');
assert.deepEqual(manifest.devDependencies,expected,'Build version set drifted');
assert.equal(lock.lockfileVersion,3,'Expected modern npm lock format');
assert.equal(lock.name,manifest.name);
assert.equal(lock.version,manifest.version);
assert.deepEqual(lock.packages[''].devDependencies,expected);
for(const [name,version] of Object.entries(expected)){
  const entry=lock.packages[`node_modules/${name}`];
  assert(entry,`${name} missing from lock`);
  assert.equal(entry.version,version,`${name} version drifted`);
  assert(entry.integrity,`${name} package integrity is not pinned`);
}
const build=readFileSync(new URL('prepare-runtime-assets.sh',import.meta.url),'utf8');
assert(build.includes('npm ci --no-audit --no-fund'));
assert(!build.includes('npm install '),'Asset build may not download an unpinned dependency tree');
console.log('PASS pinned build toolchain: exact versions, lock integrity and npm ci.');
