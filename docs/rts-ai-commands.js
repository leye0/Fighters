/* Fighters RTS — execute strategic AI decisions without mixing in planning. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersAiCommands=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({scheduleBuild,queueOrder,buildingById,witchBuilding,units,
    isFighter,isWorker,visibleAt,exploredAt,targetDistance,localDefensePost,
    acknowledgeOrcAiOrder,beginRaid,cancelFoodJob,cancelSoulJob,orderRepair}){
    function orc(actions,{aliveOrcs,enemyBaseKnown}){
      for(const action of actions){
        if(action.type==='build'){
          scheduleBuild(action.building,action.x,action.z,{byAI:true,axis:action.axis});
        }else if(action.type==='train'){
          const building=buildingById(action.buildingId);
          if(building&&!building.destroyed)queueOrder(building,'orc',action.role||'melee');
        }else if(action.type==='upgrade'){
          const building=buildingById(action.buildingId);
          if(building&&!building.destroyed)queueOrder(building,'upgrade');
        }else if(action.type==='scout'&&!enemyBaseKnown){
          const actor=aliveOrcs.find(u=>u.id===action.unitId);
          if(actor&&isFighter(actor)&&!actor.raiding&&!actor.attackOrder&&
            !actor.orcFoodJob){
            const newGoal=!actor.destination||Math.hypot(
              actor.destination.x-action.x,actor.destination.z-action.z)>1;
            actor.scouting=true;actor.destination={x:action.x,z:action.z};
            actor.defenseAnchor=null;actor.route=null;actor.routeAge=0;actor.navWatch=null;
            if(newGoal)acknowledgeOrcAiOrder([actor]);
          }
        }else if(action.type==='raid'&&enemyBaseKnown&&!witchBuilding.destroyed){
          const squad=aliveOrcs.filter(u=>isFighter(u)&&!u.defenseTime&&action.unitIds.includes(u.id));
          const newlyOrdered=squad.filter(actor=>actor.attackOrder!==witchBuilding);
          for(const actor of squad){
            beginRaid(actor);
            cancelFoodJob(actor);actor.ravenDistraction=null;actor.healJob=null;
            actor.scouting=false;actor.attackOrder=witchBuilding;
            actor.defenseAnchor=null;actor.destination=null;actor.route=null;actor.navWatch=null;
          }
          if(newlyOrdered.length)acknowledgeOrcAiOrder(newlyOrdered);
        }else if(action.type==='defend'){
          const attackers=units().filter(u=>u.kind==='witch'&&!u.dead);
          for(const actor of aliveOrcs){
            if(!isFighter(actor)||actor.raiding||actor.attackOrder||Math.hypot(
              actor.root.position.x-action.x,actor.root.position.z-action.z)>16)continue;
            const enemy=attackers.filter(u=>exploredAt(u.root.position.x,
              u.root.position.z,'orc')).sort((a,b)=>
              targetDistance(actor,a)-targetDistance(actor,b))[0];
            if(enemy){
              actor.defenseAnchor=localDefensePost(actor,{x:action.x,z:action.z});
              actor.defenseTime=Math.max(actor.defenseTime,24);
              cancelFoodJob(actor);actor.ravenDistraction=null;actor.healJob=null;
              actor.attackOrder=enemy;actor.destination=null;actor.route=null;actor.navWatch=null;
              acknowledgeOrcAiOrder([actor]);
            }
          }
        }
      }
    }

    function witch(actions,{aliveWitches,buildings,enemyTarget}){
      for(const action of actions){
        if(action.type==='build')scheduleBuild(action.building,action.x,action.z,{byAI:true});
        else if(action.type==='train'){
          const building=buildings.find(b=>b.id===action.buildingId);
          if(building)queueOrder(building,'witch',action.role);
        }else if(action.type==='upgrade'){
          const building=buildings.find(b=>b.id===action.buildingId);
          if(building)queueOrder(building,'upgrade');
        }else if(action.type==='repair'){
          const building=buildings.find(b=>b.id===action.buildingId);
          const worker=aliveWitches.find(u=>isWorker(u)&&!u.repairJob&&
            !u.constructJob&&!u.farmJob&&!u.mineJob&&!u.treeJob&&!u.woodJob&&
            !u.workerRetryTime);
          if(building&&worker)orderRepair([worker],building,{byAI:true});
        }else if(action.type==='scout'&&!enemyTarget){
          const actor=aliveWitches.find(u=>u.id===action.unitId);
          if(actor&&isFighter(actor)&&!actor.raiding&&!actor.attackOrder){
            actor.scouting=true;actor.destination={x:action.x,z:action.z};
            actor.defenseAnchor=null;actor.route=null;actor.routeAge=0;actor.navWatch=null;
          }
        }else if(action.type==='raid'&&enemyTarget&&!enemyTarget.destroyed&&
          action.targetId===enemyTarget.id){
          for(const actor of aliveWitches.filter(u=>action.unitIds.includes(u.id)&&isFighter(u)&&!u.defenseTime)){
            beginRaid(actor);
            cancelSoulJob(actor);actor.berryJob=null;actor.healJob=null;
            actor.scouting=false;actor.attackOrder=enemyTarget;
            actor.defenseAnchor=null;actor.destination=null;actor.route=null;actor.navWatch=null;
          }
        }else if(action.type==='defend'){
          const nearby=units().filter(u=>u.kind==='orc'&&!u.dead&&
            visibleAt(u.root.position.x,u.root.position.z,'witch'));
          for(const actor of aliveWitches){
            if(!isFighter(actor)||actor.raiding||actor.attackOrder||
              Math.hypot(actor.root.position.x-action.x,actor.root.position.z-action.z)>18)continue;
            const enemy=nearby.sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b))[0];
            if(enemy){
              actor.scouting=false;
              actor.defenseAnchor=localDefensePost(actor,{x:action.x,z:action.z});
              actor.defenseTime=Math.max(actor.defenseTime,24);
              cancelSoulJob(actor);actor.berryJob=null;actor.healJob=null;
              actor.attackOrder=enemy;actor.destination=null;actor.route=null;actor.navWatch=null;
            }
          }
        }
      }
    }

    return Object.freeze({orc,witch});
  }
  return Object.freeze({create});
});
