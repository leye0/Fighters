// Pointer gesture state machine. No Three.js, simulation state or DOM lookups:
// the integration layer supplies the viewport, feedback and RTS commands.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FightersGestures=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  function create({viewport,selectionRectangle,canInteract,canCompleteSelection,
    getInputModes,
    getSelectedCount,showBanner,selectRectangle,touchAt,panCamera,
    now=()=>performance.now()}){
    const activeTouches=new Map();
    let pointerStart=null;
    let twoFingerBox=null;
    let twoFingerAwaitRelease=false;
    let cameraDrag=null;
    let lastTouchAt=-10000;
    const counters={starts:0,boxes:0,selectedUnits:0,cancels:0};

    function clearSelectionBox(){selectionRectangle.hidden=true;}
    function cancelPointerGesture(){pointerStart=null;clearSelectionBox();}
    function renderSelectionRectangle(start,x,y){
      const rect=viewport.getBoundingClientRect();
      selectionRectangle.hidden=false;
      selectionRectangle.style.left=Math.min(start.x,x)-rect.left+'px';
      selectionRectangle.style.top=Math.min(start.y,y)-rect.top+'px';
      selectionRectangle.style.width=Math.max(10,Math.abs(x-start.x))+'px';
      selectionRectangle.style.height=Math.max(10,Math.abs(y-start.y))+'px';
    }
    function startTwoFingerSelection(){
      cancelPointerGesture();
      const fingers=[...activeTouches.entries()];
      if(fingers.length!==2)return;
      const [[aId,a],[bId,b]]=fingers;
      twoFingerBox={ids:[aId,bId],a:{...a},b:{...b}};
      twoFingerAwaitRelease=false;
      renderSelectionRectangle(a,b.x,b.y);
    }
    function updateTwoFingerSelection(){
      if(!twoFingerBox)return;
      const [aId,bId]=twoFingerBox.ids;
      // Retain the last point from each finger even if they release apart.
      if(activeTouches.has(aId))twoFingerBox.a={...activeTouches.get(aId)};
      if(activeTouches.has(bId))twoFingerBox.b={...activeTouches.get(bId)};
      renderSelectionRectangle(twoFingerBox.a,twoFingerBox.b.x,twoFingerBox.b.y);
    }
    function finishTwoFingerSelection(){
      if(!twoFingerBox)return;
      const {a,b}=twoFingerBox;
      twoFingerBox=null;
      twoFingerAwaitRelease=true;
      clearSelectionBox();
      if(!canCompleteSelection())return;
      selectRectangle(a,b,false);
      counters.boxes++;
      counters.selectedUnits=getSelectedCount();
      const count=counters.selectedUnits;
      showBanner(count?
        count+' UNITÉ'+(count>1?'S':'')+' SÉLECTIONNÉE'+(count>1?'S':''):
        'AUCUNE UNITÉ DANS LA ZONE');
    }
    function beginTouchPan(event){
      pointerStart={id:event.pointerId,type:'touch',mode:'tap',
        x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY};
      counters.starts++;
    }
    function updateTouchPan(event){
      const gesture=pointerStart;
      if(!gesture||gesture.id!==event.pointerId||twoFingerAwaitRelease)return;
      const x=event.clientX,y=event.clientY;
      if(gesture.mode==='tap'&&Math.hypot(x-gesture.x,y-gesture.y)>11)
        gesture.mode='pan';
      if(gesture.mode==='pan')panCamera(x-gesture.lastX,y-gesture.lastY);
      gesture.lastX=x;gesture.lastY=y;
    }
    function down(event){
      if(event.target.closest('.command-panel')||event.target.closest('.hud'))return;
      if(!canInteract())return;
      const touch=event.pointerType==='touch'||event.pointerType==='pen';
      if(!touch&&now()-lastTouchAt<750)return;
      if(!touch&&![0,1,2].includes(event.button))return;
      event.preventDefault();
      if(touch){
        lastTouchAt=now();
        activeTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(activeTouches.size===1&&!twoFingerAwaitRelease)beginTouchPan(event);
        else if(activeTouches.size===2)startTwoFingerSelection();
      }else if(event.button===1||event.button===2){
        cameraDrag={id:event.pointerId,x:event.clientX,y:event.clientY};
      }else{
        // Desktop keeps its ordinary mouse-drag rectangle selection.
        pointerStart={id:event.pointerId,type:'mouse',x:event.clientX,
          y:event.clientY,lastX:event.clientX,lastY:event.clientY,
          shift:event.shiftKey,mode:'select'};
      }
      try{viewport.setPointerCapture(event.pointerId);}catch(e){}
    }
    function move(event){
      const id=event.pointerId;
      if(activeTouches.has(id)){
        lastTouchAt=now();
        activeTouches.set(id,{x:event.clientX,y:event.clientY});
        if(twoFingerBox)updateTwoFingerSelection();
        else if(!twoFingerAwaitRelease&&activeTouches.size===1)updateTouchPan(event);
        return;
      }
      if(cameraDrag?.id===id){
        panCamera(event.clientX-cameraDrag.x,event.clientY-cameraDrag.y);
        cameraDrag.x=event.clientX;cameraDrag.y=event.clientY;return;
      }
      if(pointerStart?.id!==id||pointerStart.type!=='mouse')return;
      const gesture=pointerStart;
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8)
        renderSelectionRectangle(gesture,event.clientX,event.clientY);
      gesture.lastX=event.clientX;gesture.lastY=event.clientY;
    }
    function up(event){
      const id=event.pointerId;
      if(activeTouches.has(id)){
        lastTouchAt=now();
        activeTouches.set(id,{x:event.clientX,y:event.clientY});
        if(twoFingerBox&&twoFingerBox.ids.includes(id)){
          updateTwoFingerSelection();
          finishTwoFingerSelection();
        }
        activeTouches.delete(id);
        // The remaining finger can neither pan nor tap after finishing a box.
        if(!activeTouches.size)twoFingerAwaitRelease=false;
        if(twoFingerAwaitRelease){cancelPointerGesture();return;}
      }
      if(cameraDrag?.id===id){cameraDrag=null;return;}
      const gesture=pointerStart;
      if(!gesture||gesture.id!==id)return;
      cancelPointerGesture();
      if(gesture.type==='touch'){
        if(event.type!=='pointerup')counters.cancels++;
        if(event.type==='pointerup'&&gesture.mode==='tap'&&
          Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<16)
          touchAt(event.clientX,event.clientY);
        return;
      }
      if(event.type!=='pointerup')return;
      const distance=Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y);
      const {buildMode,attackMode,ravenMoveMode}=getInputModes();
      if(distance>15&&!buildMode&&!attackMode&&!ravenMoveMode)
        selectRectangle(gesture,{x:event.clientX,y:event.clientY},gesture.shift);
      else if(distance<16)touchAt(event.clientX,event.clientY,gesture.shift);
    }
    function snapshot(){
      return {
        activeTouches:activeTouches.size,
        twoFingerSelection:twoFingerBox?{a:{...twoFingerBox.a},b:{...twoFingerBox.b}}:null,
        touchGesture:twoFingerBox?'two-finger-select':pointerStart?.mode||null,
        touchGestureCounters:{...counters}
      };
    }
    return Object.freeze({down,move,up,snapshot});
  }
  return Object.freeze({create});
});
