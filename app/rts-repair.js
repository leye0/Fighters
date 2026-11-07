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
  // Worker state machine. Navigation and presentation are provided by the
  // composition root, but target lookup and repair progress belong here.
  // Lookup stays live: a restarted match must not retain old building objects.
  function createCycle({getBuilding,buildingContact,targetDistance,
    approachBuilding,navigateActor,markWorkBlocked,animation,
    faceBuildingCenter,workSwing,playConstructionHit,updateHealthBar,
    showBanner,refreshHUD}){
    function cancel(actor){actor.repairJob=null;}
    function tick(actor,dt){
      if(!actor.repairJob)return false;
      const building=getBuilding(actor.repairJob.buildingId);
      if(!canRepair(actor,building)){
        cancel(actor);animation(actor,'Idle_Loop');return false;
      }
      if(targetDistance(actor,building)>buildingContact){
        const goal=approachBuilding(actor,building);
        if(goal){
          const status=navigateActor(actor,goal,dt,'engage');
          if(status==='blocked'){
            markWorkBlocked(actor);cancel(actor);animation(actor,'Idle_Loop');return false;
          }
          if(status!=='moving')animation(actor,'Idle_Loop');
        }else{
          markWorkBlocked(actor);cancel(actor);animation(actor,'Idle_Loop');return false;
        }
        return true;
      }
      faceBuildingCenter(actor,building);
      animation(actor,workSwing);
      actor.workHitTimer=(actor.workHitTimer||0)+dt;
      const swingSeconds=Math.max(.35,actor.clipCatalog.get('Sword_Attack')?.duration||1);
      if(actor.workHitTimer>=swingSeconds){
        actor.workHitTimer-=swingSeconds;playConstructionHit(actor);
      }
      restore(building,dt);
      if(building.healthBar)updateHealthBar(building);
      if(building.health>=building.maxHealth){
        cancel(actor);animation(actor,'Idle_Loop');
        showBanner('BÂTIMENT RÉPARÉ');refreshHUD();
      }
      return true;
    }
    return Object.freeze({cancel,tick});
  }
  return {HEALTH_PER_SECOND,canRepair,restore,createCycle};
});
