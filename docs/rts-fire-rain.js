/* Level-three orc hut spell: same footprint and cost as the witch dome. */
(function(root,factory){
  const api=factory(root.FightersWitchDome||
    (typeof module==='object'&&module.exports?require('./rts-witch-dome'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersFireRain=api;
})(typeof globalThis==='object'?globalThis:this,function(dome){
  'use strict';
  const COST=dome.COST,RADIUS=dome.RADIUS,DURATION=4.5;
  const START_DAMAGE=.7,END_DAMAGE=3.65;
  function canCast(building,magic,{faction='orc',running=true,paused=false,active=false}={}){
    return !!building&&building.type==='hut'&&building.clanId==='orcs'&&
      !building.destroyed&&building.level>=3&&faction==='orc'&&
      running&&!paused&&!active&&Number.isFinite(magic)&&magic>=COST;
  }
  const inRange=dome.inRange;
  function impactRadiusAt(elapsed){
    return RADIUS*Math.max(0,Math.min(1,(elapsed-START_DAMAGE)/.85));
  }
  return {COST,RADIUS,DURATION,START_DAMAGE,END_DAMAGE,canCast,inRange,impactRadiusAt};
});
