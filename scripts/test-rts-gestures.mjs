import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../app/rts-gestures.js');

let clock=10000,enabled=true,selectionEnabled=true,selected=3;
let buildMode=null,attackMode=false,ravenMoveMode=false;
const events=[],box={hidden:true,style:{}};
const viewport={
  getBoundingClientRect:()=>({left:3,top:7}),
  setPointerCapture:id=>events.push(['capture',id])
};
const gestures=create({viewport,selectionRectangle:box,
  canInteract:()=>enabled,canCompleteSelection:()=>selectionEnabled,
  getInputModes:()=>({buildMode,attackMode,ravenMoveMode}),
  getSelectedCount:()=>selected,
  showBanner:message=>events.push(['banner',message]),
  selectRectangle:(a,b,append)=>events.push(['box',a,b,append]),
  touchAt:(x,y,append)=>events.push(['tap',x,y,append]),
  panCamera:(dx,dy)=>events.push(['pan',dx,dy]),now:()=>clock
});
const pointer=(id,x,y,{type='touch',button=0,shiftKey=false,phase='pointerdown'}={})=>({
  pointerId:id,clientX:x,clientY:y,pointerType:type,button,shiftKey,type:phase,
  target:{closest:()=>null},preventDefault(){events.push(['prevent',id]);}
});
const count=kind=>events.filter(e=>e[0]===kind).length;

// Direct taps never create boxes; moving the same finger pans above 11px.
gestures.down(pointer(1,100,110));
assert.equal(gestures.snapshot().touchGesture,'tap');
gestures.up(pointer(1,105,112,{phase:'pointerup'}));
assert.deepEqual(events.at(-1),['tap',105,112,undefined]);
assert.equal(gestures.snapshot().activeTouches,0);
gestures.down(pointer(2,100,100));
gestures.move(pointer(2,125,120,{phase:'pointermove'}));
assert.equal(gestures.snapshot().touchGesture,'pan');
assert.deepEqual(events.at(-1),['pan',25,20]);
gestures.up(pointer(2,125,120,{phase:'pointerup'}));
assert.equal(count('tap'),1,'a pan must not become a tap on release');

// Two fingers select immediately, tracking both endpoints at release.
gestures.down(pointer(3,30,40));
gestures.down(pointer(4,55,60));
assert.equal(gestures.snapshot().touchGesture,'two-finger-select');
assert.equal(box.hidden,false);
assert.equal(box.style.left,'27px');
assert.equal(box.style.top,'33px');
gestures.move(pointer(4,115,160,{phase:'pointermove'}));
assert.equal(box.style.width,'85px');
assert.equal(box.style.height,'120px');
gestures.up(pointer(3,30,40,{phase:'pointerup'}));
assert.equal(box.hidden,true);
assert.equal(count('box'),1);
assert.deepEqual(events.find(e=>e[0]==='box'),[
  'box',{x:30,y:40},{x:115,y:160},false]);
assert.equal(gestures.snapshot().touchGestureCounters.selectedUnits,3);
const panBefore=count('pan'),tapBefore=count('tap');
gestures.move(pointer(4,150,175,{phase:'pointermove'}));
gestures.up(pointer(4,150,175,{phase:'pointerup'}));
assert.equal(count('pan'),panBefore,'a surviving finger cannot pan');
assert.equal(count('tap'),tapBefore,'a surviving finger cannot attack');
assert.equal(gestures.snapshot().activeTouches,0);
assert.equal(gestures.snapshot().touchGestureCounters.boxes,1);

// A canceled touch records cancellation and does not issue a game command.
gestures.down(pointer(5,90,90));
gestures.up(pointer(5,90,90,{phase:'pointercancel'}));
assert.equal(gestures.snapshot().touchGestureCounters.cancels,1);
assert.equal(count('tap'),1);

// Mouse emulation after touch is ignored for 750ms. Then desktop rectangles,
// Shift-add and the right-button pan keep their original thresholds.
gestures.down(pointer(10,12,22,{type:'mouse'}));
assert.equal(gestures.snapshot().touchGesture,null);
clock+=751;
gestures.down(pointer(10,12,22,{type:'mouse',shiftKey:true}));
gestures.move(pointer(10,45,55,{type:'mouse',phase:'pointermove'}));
assert.equal(box.hidden,false);
gestures.up(pointer(10,45,55,{type:'mouse',phase:'pointerup'}));
assert.deepEqual(events.filter(e=>e[0]==='box').at(-1),[
  'box',{id:10,type:'mouse',x:12,y:22,lastX:45,lastY:55,shift:true,mode:'select'},
  {x:45,y:55},true]);
assert.equal(box.hidden,true);
gestures.down(pointer(11,50,60,{type:'mouse',button:2}));
gestures.move(pointer(11,60,80,{type:'mouse',phase:'pointermove'}));
assert.deepEqual(events.at(-1),['pan',10,20]);
gestures.up(pointer(11,60,80,{type:'mouse',phase:'pointerup'}));

// Command targets, paused state and building mode all keep their boundaries.
enabled=false;
const downCount=count('capture');
gestures.down(pointer(12,90,90));
assert.equal(count('capture'),downCount);
enabled=true;
buildMode='house';
gestures.down(pointer(13,90,90,{type:'mouse'}));
gestures.move(pointer(13,130,140,{type:'mouse',phase:'pointermove'}));
const previousBoxes=count('box');
gestures.up(pointer(13,130,140,{type:'mouse',phase:'pointerup'}));
assert.equal(count('box'),previousBoxes,'build mode must never box-select');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(game.includes('window.FightersGestures.create('));
assert(game.includes('viewport.addEventListener(\'pointerdown\',gestures.down)'));
assert(html.includes('src="./rts-gestures.js"'));
console.log('PASS touch/mouse gestures, staggered two-finger box, pan and cancellation');
