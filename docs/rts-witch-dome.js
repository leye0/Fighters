/* Level-three witch-house spell. Pure rules, shared by UI and combat ticks. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersWitchDome=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const COST=100,RADIUS=20,EXPAND_SECONDS=1.45,DURATION=3.2;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function canCast(building,magic,{faction='witch',running=true,paused=false,active=false}={}){
    return !!building&&building.type==='witch-house'&&building.clanId==='witch'&&
      !building.destroyed&&building.level>=3&&faction==='witch'&&
      running&&!paused&&!active&&Number.isFinite(magic)&&magic>=COST;
  }
  function radiusAt(elapsed){
    if(!Number.isFinite(elapsed)||elapsed<=0)return 0;
    // Accelerated start and a slower finish make the spell feel weighty.
    const progress=clamp(elapsed/EXPAND_SECONDS,0,1);
    return RADIUS*(1-(1-progress)**2);
  }
  function inRange(center,target,radius){
    if(!center||!target||!Number.isFinite(radius)||radius<0)return false;
    return (target.x-center.x)**2+(target.z-center.z)**2<=radius*radius;
  }
  return {COST,RADIUS,EXPAND_SECONDS,DURATION,canCast,radiusAt,inRange};
});
