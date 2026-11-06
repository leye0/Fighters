import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-assets.js');
const model=Buffer.alloc(36);
model.write('glTF',0,'ascii');
model.writeUInt32LE(2,4);
model.writeUInt32LE(model.length,8);
const zipped=gzipSync(model);
const requests=[],warnings=[];
const loadingProfile={characters:{},compressed:false};
const assets=create({loadingProfile,now:()=>100,
  fetchRequest:async(url,{cache,signal})=>{
    assert.equal(cache,'default');
    assert(signal instanceof AbortSignal);
    requests.push(url);
    const data=url.endsWith('.gz')?zipped:model;
    return new Response(data,{status:200,headers:{'Content-Length':String(data.length)}});
  },warn:(...args)=>warnings.push(args)});
let progress=0;
const decoded=await assets.getBinary('human_female.rts.glb',v=>progress=v);
assert.deepEqual(Buffer.from(decoded),model,'the compressed GLB must be decoded intact');
assert.equal(progress,100);
assert.deepEqual(requests,['./models/human_female.rts.glb.gz']);
assert.equal(loadingProfile.characters['human_female.rts.glb'].transport,'gzip');
assert.equal(loadingProfile.compressed,true);
assert.equal(warnings.length,0);
requests.length=0;
assert.deepEqual(Buffer.from(await assets.getBinary('quaternius_ubc_Hair_Buns.glb')),model);
assert.deepEqual(requests,['./models/quaternius_ubc_Hair_Buns.glb']);

const fallbackProfile={characters:{},compressed:false};
const retry=create({loadingProfile:fallbackProfile,now:()=>0,
  fetchRequest:async url=>{
    if(url.endsWith('.gz'))return new Response(Buffer.from('bad'),{status:200});
    return new Response(model,{status:200});
  },warn:(...args)=>warnings.push(args)});
assert.deepEqual(Buffer.from(await retry.getBinary('human_male.rts.glb')),model);
assert.equal(fallbackProfile.characters['human_male.rts.glb'].transport,'raw');
assert.equal(warnings.length,1,'bad gzip should fall back to the existing raw GLB');
const failed=create({loadingProfile:{characters:{}},
  fetchRequest:async()=>new Response('nope',{status:404}),warn:()=>{}});
await assert.rejects(failed.getBinary('human_male.rts.glb'),/Modèle RTS indisponible/);
await assert.rejects(failed.fetchAsset('https://asset.test/404'),/HTTP 404/);

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersAssets.create({loadingProfile})'));
assert(html.includes('src="./rts-assets.js"')&&
  html.indexOf('src="./rts-assets.js"')<html.indexOf('src="./game.js"'));
console.log('PASS asset transport: gzip, raw fallback, integrity and explicit runtime wiring');
