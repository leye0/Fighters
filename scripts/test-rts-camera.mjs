import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../docs/rts-camera.js');

const look={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}};
const camera={left:0,right:0,top:0,bottom:0,
  position:{copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;},
    add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}},
  lookAt(target){this.target={x:target.x,y:target.y,z:target.z};},updates:0,
  updateProjectionMatrix(){this.updates++;}};
const renderer={dimensions:null,setSize(...args){this.dimensions=args;}};
const viewport={clientWidth:1000,clientHeight:500,
  getBoundingClientRect:()=>({left:0,top:0,width:1000,height:500})};
let panelDimensions={width:250,height:180},sidebar=true;
const cameraControls=create({
  camera,look,offset:{x:18,y:18,z:18},arena:{clamp:(x,z,radius)=>({
    x:Math.max(-30,Math.min(30,x)),z:Math.max(-30,Math.min(30,z))})},
  viewport,panel:()=>({getBoundingClientRect:()=>panelDimensions}),renderer,zoom:8,
  worldPoint:(x,y)=>({x:x/100,z:y/100}),
  matchMedia:()=>({matches:sidebar}),clamp:(v,min,max)=>Math.max(min,Math.min(max,v))
});

assert.deepEqual(cameraControls.position({x:100,z:-100}),{x:30,z:-30});
assert.deepEqual(camera.target,{x:30,y:1.15,z:-30});
assert.deepEqual({x:camera.position.x,y:camera.position.y,z:camera.position.z},
  {x:48,y:19.15,z:-12});
const moved=cameraControls.pan({x:0,z:0},10,20);
assert(Math.abs(moved.x+.1)<1e-10);
assert(Math.abs(moved.z+.2)<1e-10);

cameraControls.resize();
assert.equal(camera.left,-20,'desktop sidebar expands left-hand frustum');
assert.equal(camera.right,12);
assert.equal(camera.top,8);
assert.equal(camera.bottom,-8);
assert.deepEqual(renderer.dimensions,[1000,500,false]);
assert.equal(camera.updates,1);
sidebar=false;viewport.clientWidth=390;viewport.clientHeight=700;
panelDimensions={width:390,height:300};
cameraControls.resize();
assert.equal(camera.top,8*(1-.42),'mobile bottom HUD changes vertical framing');
assert.equal(camera.bottom,-8*(1+.42));
assert.equal(camera.updates,2);

const game=readFileSync(new URL('../docs/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersCamera.create('));
assert(game.includes('cameraControls.pan(cameraFollow,dx,dy)'));
assert(game.includes('cameraControls.resize()'));
assert(html.includes('src="./rts-camera.js"'));
console.log('PASS independent camera panning, bounds and desktop/mobile framing');
