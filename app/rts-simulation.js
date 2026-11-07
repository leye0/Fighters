/* Fighters RTS — deterministic fixed-step scheduling, independent of Three.js. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSimulation=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const FIXED_DT=1/60,MAX_TICKS_PER_FRAME=12;

  // The list is built once at boot. Stage names describe ordering without
  // creating work objects, sorting stages, or allocating during a game tick.
  function createStepper(isActive,stages){
    if(typeof isActive!=='function'||!Array.isArray(stages)||
      stages.some(stage=>!Array.isArray(stage)||typeof stage[0]!=='string'||
        typeof stage[1]!=='function'))throw Error('Invalid simulation pipeline');
    const ticks=stages.map(stage=>stage[1]);
    return function stepGame(dt){
      if(!isActive())return;
      for(const tick of ticks)tick(dt);
    };
  }

  // Preserve the original 250ms frame clamp and 12-tick catch-up budget.
  // Return only the leftover time to avoid per-frame allocations.
  function advanceFrame(accumulator,dt,step){
    accumulator+=dt;
    let ticks=0;
    while(accumulator>=FIXED_DT&&ticks<MAX_TICKS_PER_FRAME){
      step(FIXED_DT);accumulator-=FIXED_DT;ticks++;
    }
    return ticks===MAX_TICKS_PER_FRAME?0:accumulator;
  }

  return Object.freeze({FIXED_DT,MAX_TICKS_PER_FRAME,createStepper,advanceFrame});
});
