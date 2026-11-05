(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FightersRepair=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // One worker restores an entire building from near-zero health in ~6 seconds
  // once alongside it. Extra workers can collaborate on the same structure.
  const HEALTH_PER_SECOND=.18;
  function canRepair(worker,building){
    return !!worker&&!worker.dead&&worker.role==='worker'&&
      !!building&&!building.destroyed&&building.type!=='mine'&&
      building.clanId===(worker.kind==='witch'?'witch':'orcs')&&
      Number.isFinite(building.maxHealth)&&building.maxHealth>0&&
      building.health>0&&building.health<building.maxHealth;
  }
  function restore(building,seconds){
    if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid repair time');
    if(!building||building.destroyed||building.health<=0)return 0;
    const previous=building.health;
    building.health=Math.min(building.maxHealth,
      previous+building.maxHealth*HEALTH_PER_SECOND*seconds);
    return building.health-previous;
  }
  return {HEALTH_PER_SECOND,canRepair,restore};
});
