import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-minimap.js');

const operations=[],createContext=()=>({
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  putImageData:image=>operations.push(['pixels',image.data.slice(0,4)]),
  drawImage:()=>operations.push(['raster']),
  beginPath:()=>operations.push(['begin']),
  lineTo:()=>{},moveTo:()=>{},closePath:()=>{},
  fill:()=>operations.push(['building']),
  stroke:()=>operations.push(['camera']),
  fillRect:()=>operations.push(['unit'])
});
const canvas={width:112,height:112,
  getContext:()=>createContext(),
  getBoundingClientRect:()=>({left:10,top:20,width:200,height:200}),
  ownerDocument:{createElement:()=>({getContext:()=>createContext()})}
};
const arena={SIZE:20,HALF:10,worldHalf:10,
  toWorld:(x,z)=>({x,z}),toMap:(x,z)=>({x,z})};
const fogOfWar={maps:{witch:{explored:new Uint8Array([255])},
  orc:{explored:new Uint8Array([255])}},index:()=>0,
  sample:()=>({explored:1}),exploredAt:()=>true};
const groundFog={maps:{witch:{visible:new Uint8Array([255])},
  orc:{visible:new Uint8Array([255])}},updates:[],
  update(...args){this.updates.push(args);},
  sample:()=>({visible:1})};
let faction='witch';
const building=(id,clanId,type='hut')=>({id,clanId,type,
  hitbox:{minX:-1,maxX:1,minZ:-1,maxZ:1}});
const units=[{kind:'witch',dead:false,root:{position:{x:-2,z:-2}}},
  {kind:'orc',dead:false,root:{position:{x:2,z:2}}}];
const minimap=create({canvas,arena,fogOfWar,makeGroundFog:()=>groundFog,
  groundSightSources:()=>[{x:0,z:0}],
  getBuildings:()=>[building('home','witch'),building('enemy','orcs')],
  getUnits:()=>units,knownEnemyBuildings:{witch:new Set(),orc:new Set()},
  getFaction:()=>faction,
  viewport:{getBoundingClientRect:()=>({left:0,top:0,right:200,bottom:200})},
  worldPoint:(x,y)=>({x:x/10-10,z:y/10-10})});

assert.equal(minimap.groundFog,groundFog,'maintain the separate ground-sight map');
minimap.draw();
assert.equal(groundFog.updates.length,1);
assert.equal(operations.filter(o=>o[0]==='pixels').length,1,
  'one cached 112x112 fog raster per update');
assert.deepEqual([...operations.find(o=>o[0]==='pixels')[1]],[53,100,65,255]);
assert.equal(operations.filter(o=>o[0]==='building').length,1,
  'unknown enemy building stays hidden');
assert.equal(operations.filter(o=>o[0]==='unit').length,2);
assert.equal(operations.filter(o=>o[0]==='camera').length,1);
assert.deepEqual(minimap.worldAt(110,120),{x:0,z:0});
assert.deepEqual(minimap.worldAt(10,20),{x:-10,z:-10});
faction='orc';minimap.draw();
assert.equal(groundFog.updates.at(-1)[0],'orc');

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersMinimap.create('));
assert(game.includes('const minimapGroundFog=minimapRenderer.groundFog'));
assert(html.includes('src="./rts-minimap.js"'));
console.log('PASS isolated minimap fog raster, sight, building and unit drawing');
