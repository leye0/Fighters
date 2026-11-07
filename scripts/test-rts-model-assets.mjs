import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {create}=require('../app/rts-model-assets.js');
const events=[];
class Loader{
  constructor(){events.push('constructed');}
  setMeshoptDecoder(decoder){events.push(['decoder',decoder]);}
  loadAsync(url){events.push(['load',url]);return Promise.resolve({scene:{url}});}
  parseAsync(bytes,path){events.push(['parse',bytes,path]);return Promise.resolve({scene:{bytes}});}
}
const decoder={decode:()=>{}};
const assets=create({GLTFLoader:Loader,MeshoptDecoder:decoder});
assert.deepEqual(events,['constructed',['decoder',decoder]],
  'meshopt must be installed before any GLB parsing or loading');

const first=assets.load('forest/tree.glb');
const second=assets.load('forest/tree.glb');
assert.notEqual(first,second,'normal loads stay independent for mutable scenes');
assert.equal(events.filter(e=>Array.isArray(e)&&e[0]==='load').length,2);

const shared=assets.cached('cauldron:2','buildings/cauldron-2.glb');
const reused=assets.cached('cauldron:2','ignored.glb');
assert.equal(reused,shared,'one shared model promise for the same level key');
assert.deepEqual((await reused).scene,{url:'buildings/cauldron-2.glb'});
assert.equal(events.filter(e=>Array.isArray(e)&&e[0]==='load').length,3);
await assets.cached('cauldron:3','buildings/cauldron-3.glb');
assert.equal(events.filter(e=>Array.isArray(e)&&e[0]==='load').length,4);

const binary=new Uint8Array([1,2,3]);
assert.deepEqual((await assets.parse(binary)).scene,{bytes:binary});
assert(events.some(e=>Array.isArray(e)&&e[0]==='parse'&&e[1]===binary&&e[2]===''),
  'binary parse must keep GLTFLoader relative-path semantics');
const fresh=create({GLTFLoader:Loader,MeshoptDecoder:decoder});
assert.notEqual(assets,fresh,'separate games or tests have separate loader caches');
assert.throws(()=>create({GLTFLoader:null,MeshoptDecoder:decoder}),/GLTFLoader/);

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersModelAssets.create({GLTFLoader,MeshoptDecoder})'));
assert(game.includes('modelAssets.cached(key,entry.file)'));
assert(!game.includes('loader.loadAsync(')&&!game.includes('loader.parseAsync('));
assert(html.includes('<script src="./rts-model-assets.js"></script>'));
console.log('PASS GLB loader: early meshopt registration, uncached scenes, level cache and binary parse');
