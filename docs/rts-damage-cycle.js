/* Health, death and building-destruction transitions. Gameplay mutations and
 * callback ordering belong here; scene meshes, voice engines, animation and
 * HUD operations are injected by the game composition root. No Three.js.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersDamageCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({isBuilding,units,buildingInstances,witchBuilding,selected,
    clearDomeFor,removeBuildingModel,hideBuildingHealthBar,removeRallyMarker,
    forgetBuilding,drawBuildingSelection,cancelMineJob,cancelFarmJob,cancelRepair,
    removeGarden,releaseConstructedBuilding,syncWallJoints,updateNavObstacles,
    invalidateHud,refreshHUD,endBattle,alertVillageUnderAttack,
    showBuildingDamage,showBanner,selectedBuilding,alertNearbyDefenders,
    cancelSoulJob,cancelConstruction,cancelWoodJob,playOrcVoice,playWitchVoice,
    hideUnitSelection,animation,corpseSeconds}){

    function protectedBuilding(building){
      return building.type==='mine'||building.clanId==='neutral'||building.destroyed;
    }

    function destroyBuilding(building){
      if(protectedBuilding(building))return;
      building.destroyed=true;building.health=0;building.queue.length=0;
      clearDomeFor(building);
      building.progress=0;
      removeBuildingModel(building);
      hideBuildingHealthBar(building);
      removeRallyMarker(building);
      if(forgetBuilding(building))drawBuildingSelection();
      // The next discovered enemy building replaces this target on the next
      // combat tick, once its navigation obstacle has been removed.
      for(const actor of units){
        if(actor.attackOrder===building)actor.attackOrder=null;
        if(actor.attack?.target===building)actor.attack=null;
      }
      for(const actor of units){
        if(actor.mineJob?.mineId===building.id)cancelMineJob(actor);
        if(actor.farmJob?.gardenId===building.id)cancelFarmJob(actor);
        if(actor.healJob?.id===building.id)actor.healJob=null;
        if(actor.repairJob?.buildingId===building.id)cancelRepair(actor);
      }
      if(building.type==='garden')removeGarden(building.id);
      if((building.clanId==='orcs'||building.type==='garden'||
        building.type==='stone-circle')&&!building.initial){
        releaseConstructedBuilding(building);
        buildingInstances.delete(building.id);
      }
      if(building.type==='wall')syncWallJoints();
      updateNavObstacles();invalidateHud();refreshHUD();
      if(building===witchBuilding)endBattle(false);
      else if(building.clanId==='orcs'&&![...buildingInstances.values()].some(
        b=>!b.destroyed&&b.clanId==='orcs'&&b.type!=='wall'))endBattle(true);
    }

    function damageBuilding(building,amount,attacker){
      if(protectedBuilding(building))return;
      building.health=Math.max(0,building.health-amount);
      alertVillageUnderAttack(building,attacker);
      if(building.healthBar)showBuildingDamage(building);
      if(building.health===0){showBanner('BÂTIMENT DÉTRUIT');destroyBuilding(building);}
      else if(selectedBuilding()===building)refreshHUD();
    }

    function dealDamage(target,amount,attacker){
      if(isBuilding(target)){damageBuilding(target,amount,attacker);return;}
      if(target.dead)return;
      alertNearbyDefenders(target,attacker);
      target.health=Math.max(0,target.health-amount);target.stun=.24;
      if(!target.health){
        cancelSoulJob(target);
        cancelConstruction(target);cancelWoodJob(target);cancelFarmJob(target);
        if(target.kind==='orc')playOrcVoice('loud',target.root.position);
        else if(target.kind==='witch')playWitchVoice('destruction',target.root.position);
        target.dead=true;target.deadTime=corpseSeconds;
        target.soulClaimed=false;target.soulReservedBy=null;
        target.destination=null;target.attackOrder=null;
        selected.delete(target);hideUnitSelection(target);
        animation(target,'Death01',true);refreshHUD();
        // The orc can feast on the body only AFTER the normal death effects.
        if(target.kind==='witch'&&attacker?.kind==='orc'&&!attacker.dead&&
          !attacker.orcFoodJob){
          attacker.orcFoodJob={kind:'corpse',id:target.id,progress:0};
          attacker.ravenDistraction=null;
        }
      }else animation(target,'Hit_Chest',true);
    }

    return Object.freeze({destroyBuilding,damageBuilding,dealDamage});
  }

  return Object.freeze({create});
});
