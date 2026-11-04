/* Fighters RTS — standing-stone sanctuary rules, independent of rendering. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersHealing=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const RADIUS=1.4,HEAL_PER_SECOND=11,RETREAT_AT=.70,RECOVER_TO=.96;
  const HOSTILE_SAFETY_DISTANCE=9;
  function inside(unit,circle){
    return Math.hypot(unit.x-circle.x,unit.z-circle.z)<=RADIUS;
  }
  function restore(current,maximum,dt){
    if(!Number.isFinite(dt)||dt<0)throw Error('Invalid healing time');
    return Math.min(maximum,Math.max(0,current)+HEAL_PER_SECOND*dt);
  }
  function needsRest(unit){
    return unit.maxHealth>0&&unit.health/unit.maxHealth<RETREAT_AT;
  }
  function recovered(unit){
    return unit.health>=unit.maxHealth*RECOVER_TO;
  }
  function nearestCircle(unit,circles,reachable=()=>true){
    return circles.filter(circle=>!circle.destroyed&&reachable(circle))
      .sort((a,b)=>Math.hypot(unit.x-a.x,unit.z-a.z)-
        Math.hypot(unit.x-b.x,unit.z-b.z))[0]||null;
  }
  return Object.freeze({RADIUS,HEAL_PER_SECOND,RETREAT_AT,RECOVER_TO,
    HOSTILE_SAFETY_DISTANCE,inside,restore,needsRest,recovered,nearestCircle});
});
