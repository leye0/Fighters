export async function runTouchQa({evaluate,call,check,screenshot,sleep}){
 // Responsive command grid must remain visible in portrait phone layout.
 await call('Emulation.setDeviceMetricsOverride',{
  width:390,height:844,deviceScaleFactor:1,mobile:true
 });
 await sleep(450);
 const mobile=await evaluate("(()=>{const p=document.querySelector('#command-panel').getBoundingClientRect();const q=document.querySelector('#pause').getBoundingClientRect();return {width:innerWidth,height:innerHeight,panel:p.toJSON(),pause:q.toJSON(),scrollWidth:document.documentElement.scrollWidth}})()");
 check(mobile.panel.width<=mobile.width&&mobile.panel.bottom<=mobile.height+1&&
   mobile.panel.height<=180&&mobile.panel.top>=mobile.height-182,
  'Mobile command panel must be a compact strip, not a huge sheet: '+
  JSON.stringify(mobile.panel));
 const noBrowserZoom=await evaluate(`(()=>{
   const action=selector=>getComputedStyle(document.querySelector(selector)).touchAction;
   const doubleTap=new MouseEvent('dblclick',{bubbles:true,cancelable:true});
   const pinch=new Event('gesturestart',{bubbles:true,cancelable:true});
   document.querySelector('#viewport').dispatchEvent(doubleTap);
   document.dispatchEvent(pinch);
   return {
     viewportMeta:document.querySelector('meta[name="viewport"]').content,
     surfaces:['#viewport','#pause','#choose-witch','#command-buttons button',
       '#war2-minimap'].map(action),
     scrollPanels:['.start-card','.command-panel'].map(action),
     doubleTapPrevented:doubleTap.defaultPrevented,
     pinchPrevented:pinch.defaultPrevented
   };
 })()`);
 check(noBrowserZoom.viewportMeta.includes('maximum-scale=1')&&
   noBrowserZoom.surfaces.every(action=>action==='none')&&
   noBrowserZoom.scrollPanels.every(action=>action==='pan-y')&&
   noBrowserZoom.doubleTapPrevented&&noBrowserZoom.pinchPrevented,
   'Mobile Safari must have no page-zoom gestures, but scrollable panels must still pan: '+
   JSON.stringify(noBrowserZoom));
 const mobileMini=await evaluate("(()=>{const m=document.querySelector('#war2-minimap').getBoundingClientRect(),buttons=[...document.querySelectorAll('#command-buttons button:not([hidden])')].map(b=>b.getBoundingClientRect().toJSON());return {map:m.toJSON(),buttons}})()");
 check(mobileMini.map.width>=40&&mobileMini.map.height>=40&&
   mobileMini.buttons.length<=6&&mobileMini.buttons.every(b=>b.width>=56&&b.height>=44&&
     b.left>=0&&b.right<=mobile.width),
   'Mobile minimap or icon grid overflowed: '+JSON.stringify(mobileMini));
 // War II original: only context commands, direct training icons on a
 // building, worker construction submenu and no invented army shortcuts.
 const mobileUsability=await evaluate("(()=>{const p=document.querySelector('#command-panel'),t=document.querySelector('#command-title'),i=document.querySelector('.command-identity'),g=document.querySelector('#command-buttons'),q=document.querySelector('#training-progress'),b=[...g.querySelectorAll('button:not([hidden])')];const title=getComputedStyle(t);return {name:t.textContent,font:parseFloat(title.fontSize),nameVisible:t.scrollWidth<=t.clientWidth+1,identity:i.getBoundingClientRect().toJSON(),commands:b.map(x=>x.getBoundingClientRect().toJSON()),labels:b.map(x=>({name:x.querySelector('.action-name')?.textContent,visible:getComputedStyle(x.querySelector('.action-name')).display})),queueVisible:getComputedStyle(q).display!=='none',hasNext:!!g.querySelector('.command-page-next'),hasShortcuts:!!document.querySelector('#quick-commands'),panel:p.getBoundingClientRect().toJSON()}})()");
 check(mobileUsability.font>=12&&mobileUsability.nameVisible&&
   mobileUsability.commands.length>=3&&mobileUsability.commands.length<=6&&
   !mobileUsability.hasNext&&!mobileUsability.hasShortcuts&&
   mobileUsability.labels.every(x=>x.visible!=='none')&&
   mobileUsability.commands.every(x=>x.top>=mobileUsability.identity.bottom&&
     x.bottom<=mobileUsability.panel.bottom-6&&x.height>=44)&&
   !mobileUsability.queueVisible,
   'Mobile HUD must preserve readable contextual Warcraft II commands only: '+
   JSON.stringify(mobileUsability));
 check(mobileUsability.labels.some(x=>x.name==='Ouvrière')&&
   mobileUsability.labels.some(x=>x.name==='Garde'),
   'Witch house must expose training icons directly');
 console.log('PASS WARCRAFT II MOBILE HUD: 44px direct train icons and no invented shortcut row.');
 check(mobile.pause.width>0,'Compact pause button missing');
 await screenshot('rts-mobile-command-panel');
 await evaluate("window.__fightersQA.selectUnit('witch',1)");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent==='Construire')"),
   'Witch worker needs its contextual Build icon');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Construire')?.click()");
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent==='Maison')"),
   'Witch Build submenu must expose construction type');
 check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.querySelector('.action-name')?.textContent==='Retour')"),
   'Build submenu must expose a Back command');
 await screenshot('rts-mobile-worker-build-submenu');
 await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.querySelector('.action-name')?.textContent==='Retour')?.click();window.__fightersQA.selectHouse()");

 const framing=await evaluate("(()=>{const hero=document.querySelector('.hero-hud').getBoundingClientRect();const score=document.querySelector('.score').getBoundingClientRect();const pause=document.querySelector('#pause').getBoundingClientRect();return {hero:{right:hero.right,bottom:hero.bottom},score:{left:score.left,right:score.right},pause:{left:pause.left,right:pause.right}}})()");
 check(framing.hero.right<=framing.score.left+3&&framing.score.right<=framing.pause.left+4&&
  framing.pause.right<=mobile.width+1,'Compact mobile HUD overlaps: '+JSON.stringify(framing));
 const resourceBadges=await evaluate("Array.from(document.querySelectorAll('.score>div'),d=>({icon:getComputedStyle(d.querySelector('small'),'::before').content,border:getComputedStyle(d).borderColor}))");
 check(resourceBadges.length===5&&resourceBadges.every((item,i)=>
   item.icon.includes(['💰','🪵','🌾','🔮','⚔'][i]))&&
   new Set(resourceBadges.map(v=>v.icon)).size===5,
   'Mobile resource counters need five distinct resource pictograms: '+
   JSON.stringify(resourceBadges));
 // Two real simultaneous touch pointers form a rectangle immediately.
 // The old hold-to-select and pinch-to-zoom paths are intentionally gone.
 await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const touch=(id,x,y)=>({id,x,y,force:1,radiusX:4,radiusY:4});
 const initialPageScale=await evaluate('visualViewport?.scale||1');
 for(let tap=0;tap<2;tap++){
   await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(80,175,295)]});
   await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 check(Math.abs((await evaluate('visualViewport?.scale||1'))-initialPageScale)<.001,
   'A real double-tap must not change the mobile page scale');
 const fixedMobileZoom=35/(3*1.35);
 await evaluate("window.__fightersQA.reset();window.__fightersQA.centerCamera(-18,-14)");
 let selectionBefore=await evaluate('window.__fightersQA.snapshot()');
 const witchScreen=await evaluate("Array.from({length:3},(_,i)=>window.__fightersQA.unitScreenPoint('witch',i))");
 const panelTop=await evaluate("document.querySelector('#command-panel').getBoundingClientRect().top");
 const bound={
   x1:Math.max(16,Math.floor(Math.min(...witchScreen.map(p=>p.x))-21)),
   y1:Math.max(115,Math.floor(Math.min(...witchScreen.map(p=>p.y))-21)),
   x2:Math.min(374,Math.ceil(Math.max(...witchScreen.map(p=>p.x))+21)),
   y2:Math.ceil(Math.max(...witchScreen.map(p=>p.y))+21)
 };
 console.log('MOBILE TWO-FINGER BOUNDS:',JSON.stringify({witchScreen,bound,panelTop,zoom:selectionBefore.cameraZoom}));
 check(bound.x2>bound.x1+25&&bound.y2>bound.y1+25&&bound.y2<panelTop-6,
   '3 starting witches must be visible at fixed 4.05× zoom: '+JSON.stringify({witchScreen,bound,panelTop}));
 // A true single-finger tap must select a witch, never the building behind it.
 const singleTouch=touch(77,witchScreen[2].x,witchScreen[2].y);
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[singleTouch]});
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const oneTap=await evaluate('window.__fightersQA.snapshot()');
 check(oneTap.selectedIds.length>0&&oneTap.selectedBuildingId===null,
   'A single mobile tap on a witch selected the house or nothing: '+
     JSON.stringify({point:singleTouch,selected:oneTap.selectedIds,building:oneTap.selectedBuildingId,
       gesture:oneTap.touchGesture}));
 console.log('PASS MOBILE SINGLE TAP: physical touch events select a friendly witch.');
 await evaluate('window.__fightersQA.selectHouse()');
 const first=touch(1,bound.x1,bound.y1),second=touch(2,bound.x1+22,bound.y1+22);
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first,second]});
 let boxState=await evaluate('window.__fightersQA.snapshot()');
 check(boxState.activeTouches===2&&boxState.touchGesture==='two-finger-select'&&
   boxState.selectionRectangleVisible&&boxState.twoFingerSelection,
   'Two fingers must show a rectangle IMMEDIATELY, without a long press: '+JSON.stringify(boxState));
 const cameraBeforeBox={...boxState.cameraCenter};
 const boxMove=[first,touch(2,bound.x2,bound.y2)];
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:boxMove});
 boxState=await evaluate('window.__fightersQA.snapshot()');
 check(boxState.selectionRectangleVisible&&
   Math.abs(boxState.twoFingerSelection.b.x-bound.x2)<1&&
   Math.abs(boxState.twoFingerSelection.b.y-bound.y2)<1,
   'Two-finger rectangle must follow both live fingertips: '+
     JSON.stringify(boxState.twoFingerSelection));
 check(Math.abs(boxState.cameraZoom-fixedMobileZoom)<1e-7&&
   Math.hypot(boxState.cameraCenter.x-cameraBeforeBox.x,
     boxState.cameraCenter.z-cameraBeforeBox.z)<.05,
   'Spreading two fingers must SELECT, not zoom or pan the camera');
 // End both touches at once, as the iPhone can; selection must survive the
 // multiple pointerup events and no surviving finger may trigger a tap.
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 boxState=await evaluate('window.__fightersQA.snapshot()');
 check(!boxState.selectionRectangleVisible&&boxState.activeTouches===0&&
   boxState.selectedIds.length===3&&boxState.visibleSelectionRings===3&&
   boxState.touchGestureCounters.boxes>0,
   'Two-finger rectangle failed to select three actual witches: '+JSON.stringify({
     selected:boxState.selectedIds,rings:boxState.visibleSelectionRings,
     gesture:boxState.touchGesture,counters:boxState.touchGestureCounters,witchScreen,bound
   }));
 await screenshot('rts-mobile-two-finger-selected-witches');
 console.log('PASS MOBILE TWO-FINGER SELECT: 3/3 witches selected; zoom unchanged at 35/(3*1.35).');

 // iPhone users rarely lift both fingers simultaneously. The FIRST release
 // must finish the selection; movement from the finger left on-screen must
 // never become an unintended pan, tap, or attack command.
 await evaluate("window.__fightersQA.selectHouse();window.__fightersQA.centerCamera(-18,-14)");
 const firstLiftStart=touch(9,bound.x1,bound.y1);
 const secondLiftEnd=touch(10,bound.x2,bound.y2);
 await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[
   firstLiftStart,touch(10,bound.x1+22,bound.y1+22)
 ]});
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[firstLiftStart,secondLiftEnd]});
 const staggeredCamera=(await evaluate('window.__fightersQA.snapshot()')).cameraCenter;
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[secondLiftEnd]});
 let staggered=await evaluate('window.__fightersQA.snapshot()');
 check(staggered.selectedIds.length===3&&staggered.activeTouches===1&&
   !staggered.selectionRectangleVisible,
   'First finger release must finalize the box even if the other finger remains: '+JSON.stringify(staggered));
 await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(10,bound.x2+35,bound.y2+10)]});
 staggered=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(staggered.cameraCenter.x-staggeredCamera.x,
   staggered.cameraCenter.z-staggeredCamera.z)<.05&&
   staggered.selectedIds.length===3,
   'Remaining touch after box select must not turn into a camera pan');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 staggered=await evaluate('window.__fightersQA.snapshot()');
 check(staggered.activeTouches===0&&staggered.selectedIds.length===3&&
   staggered.visibleSelectionRings===3,
   'Lifting second finger must not issue an accidental tap/order');
 console.log('PASS STAGGERED TWO-FINGER RELEASE: finalize on first lift, no pan/tap from remaining finger.');


 // A single finger may still drag the camera but cannot select a group.
 await evaluate('window.__fightersQA.centerCamera(0,0)');
 const beforeSinglePan=await evaluate('window.__fightersQA.snapshot()');
 await call('Input.dispatchTouchEvent',{type:'touchStart',
   touchPoints:[touch(4,155,310)]});
 await call('Input.dispatchTouchEvent',{type:'touchMove',
   touchPoints:[touch(4,220,355)]});
 await sleep(80);
 const afterSinglePan=await evaluate('window.__fightersQA.snapshot()');
 check(Math.hypot(afterSinglePan.cameraCenter.x-beforeSinglePan.cameraCenter.x,
   afterSinglePan.cameraCenter.z-beforeSinglePan.cameraCenter.z)>.2,
   'One-finger drag must continue to pan the map: '+
     JSON.stringify({before:beforeSinglePan.cameraCenter,after:afterSinglePan.cameraCenter}));
 check(afterSinglePan.selectedIds.join(',')===beforeSinglePan.selectedIds.join(',')&&
   Math.abs(afterSinglePan.cameraZoom-fixedMobileZoom)<1e-7,
   'One-finger pan changed the selected group or fixed zoom');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

 // One-finger HOLD is not selection anymore. A stationary hold on empty
 // ground must not display a selection rectangle or alter the group.
 await evaluate("window.__fightersQA.centerCamera(-18,-14)");
 const beforeHold=await evaluate('window.__fightersQA.snapshot()');
 await call('Input.dispatchTouchEvent',{type:'touchStart',
   touchPoints:[touch(7,335,340)]});
 await sleep(1150);
 const afterHold=await evaluate('window.__fightersQA.snapshot()');
 check(!afterHold.selectionRectangleVisible&&afterHold.touchGesture==='tap'&&
   afterHold.selectedIds.join(',')===beforeHold.selectedIds.join(','),
   'One-finger long press must NOT start rectangle selection');
 await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 const mobileForest=await evaluate('window.__fightersQA.snapshot().forest');
 check(mobileForest.visibleInViewport>=3,
   'Portrait-phone camera must display at least three revealed trees: '+JSON.stringify(mobileForest));
 await screenshot('rts-mobile-fixed-camera');
 await call('Emulation.clearDeviceMetricsOverride');
}
