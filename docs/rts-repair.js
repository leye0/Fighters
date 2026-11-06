(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FightersRepair=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // One worker restores an entire building from near-zero health in ~6 seconds
  // once alongside it. Extra workers can collaborate on the same structure.
  const HEALTH_PER_SECOND=.18;
  // Repairing a fully ruined (but still standing) building costs 35% of its
  // construction resources. Upgraded buildings are more valuable to maintain.
  const REPAIR_COST_RATIO=.35;
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
  function fullRepairCost(building,construction){
    const level=Math.max(1,building.level||1);
    const multiplier=REPAIR_COST_RATIO*(1+.5*(level-1));
    return {gold:Math.max(0,construction.gold||0)*multiplier,
      wood:Math.max(0,construction.wood||0)*multiplier};
  }
  function restorePaid(building,seconds,budget,construction){
    if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid repair time');
    if(!building||building.destroyed||building.health<=0||
      !Number.isFinite(building.maxHealth)||building.maxHealth<=0||
      building.health>=building.maxHealth)
      return {restored:0,goldSpent:0,woodSpent:0};
    const cost=fullRepairCost(building,construction);
    const availableGold=Math.max(0,budget.gold||0);
    const availableWood=Math.max(0,budget.wood||0);
    const affordableFraction=Math.min(1,
      cost.gold?availableGold/cost.gold:1,
      cost.wood?availableWood/cost.wood:1);
    const restored=Math.max(0,Math.min(
      building.maxHealth-building.health,
      building.maxHealth*HEALTH_PER_SECOND*seconds,
      building.maxHealth*affordableFraction));
    if(restored<1e-8)return {restored:0,goldSpent:0,woodSpent:0};
    building.health=Math.min(building.maxHealth,building.health+restored);
    return {restored,goldSpent:cost.gold*restored/building.maxHealth,
      woodSpent:cost.wood*restored/building.maxHealth};
  }
  return {HEALTH_PER_SECOND,REPAIR_COST_RATIO,canRepair,restore,
    fullRepairCost,restorePaid};
});
