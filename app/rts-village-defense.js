/* Reactive village defense: retaliation, post selection, local pursuit and
 * emergency repairs. No DOM, Three.js or rendering state. The composition
 * root injects visibility, navigation, orders and job cancellation.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersVillageDefense=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  const VILLAGE_DEFENSE_LEASH=18;

  function create({units,isBuilding,enemyOf,isFighter,isWorker,aiEnabled,
    raidingAttacked,cancelSoulJob,cancelFoodJob,liveBuildings,unitFaction,
    distanceToBuilding,targetDistance,visibleAt,findSafeGoal,orderRepair}){

    function villageCenter(building){
      return {x:(building.hitbox.minX+building.hitbox.maxX)/2,
        z:(building.hitbox.minZ+building.hitbox.maxZ)/2};
    }

    function defenseTargetPosition(target){
      return isBuilding(target)?villageCenter(target):target.root.position;
    }

    function alertNearbyDefenders(victim,attacker){
      if(!attacker||attacker.dead||victim.dead||!enemyOf(attacker,victim))return;
      const kind=victim.kind,point=victim.root.position;
      // A raiding squad counterattacks locally without abandoning its raid.
      if(victim.raiding&&isFighter(victim)){
        for(const ally of units){
          if(ally.kind!==kind||ally.dead||!isFighter(ally)||!ally.raiding||
            Math.hypot(ally.root.position.x-point.x,
              ally.root.position.z-point.z)>8)continue;
          raidingAttacked(ally,attacker);
        }
      }
      const controlled=aiEnabled(kind);
      const guards=units.filter(u=>u.kind===kind&&!u.dead&&isFighter(u)&&
        !u.raiding&&
        Math.hypot(u.root.position.x-point.x,u.root.position.z-point.z)<=18&&
        (controlled||(!u.destination&&!u.attackOrder)));
      for(const guard of guards){
        if(guard.attackOrder===attacker&&guard.defenseAnchor)continue;
        const p=guard.root.position;
        guard.defenseAnchor={x:point.x,z:point.z,radius:13,
          returnPoint:{x:p.x,z:p.z}};
        guard.defenseTime=Math.max(guard.defenseTime,18);
        cancelSoulJob(guard);cancelFoodJob(guard);
        guard.ravenDistraction=null;guard.healJob=null;
        guard.scouting=false;guard.attackOrder=attacker;
        guard.destination=null;guard.route=null;guard.routeAge=0;guard.navWatch=null;
        guard.approachCache=null;
      }
    }

    function localDefensePost(actor,threat){
      let nearby=null,distance=12;
      for(const building of liveBuildings()){
        if(building.clanId!==unitFaction(actor))continue;
        const d=distanceToBuilding(threat,building.hitbox);
        if(d<distance){nearby=building;distance=d;}
      }
      const origin=nearby?villageCenter(nearby):{x:threat.x,z:threat.z};
      return {...origin,buildingId:nearby?.id||null,
        radius:nearby?VILLAGE_DEFENSE_LEASH:13,
        returnPoint:{x:actor.root.position.x,z:actor.root.position.z}};
    }

    function returnFromDefense(actor){
      const anchor=actor.defenseAnchor;
      if(!anchor)return;
      actor.attackOrder=null;actor.route=null;actor.navWatch=null;
      actor.approachCache=null;
      actor.destination=anchor.returnPoint||{x:actor.root.position.x,z:actor.root.position.z};
      actor.defenseAnchor=null;
    }

    function updateVillageDefense(actor){
      const anchor=actor.defenseAnchor;
      if(!anchor)return;
      const target=actor.attackOrder;
      const position=target&&enemyOf(actor,target)?defenseTargetPosition(target):null;
      if(position&&Math.hypot(position.x-anchor.x,position.z-anchor.z)<=anchor.radius)return;
      if(position){
        actor.unreachableTarget=target;
        actor.unreachableTime=Math.max(actor.unreachableTime,5);
      }
      // A fleeing raider must not drag the garrison out of the village.
      const next=units.filter(other=>enemyOf(actor,other)&&
        (other!==actor.unreachableTarget||actor.unreachableTime<=0)&&
        Math.hypot(other.root.position.x-anchor.x,
          other.root.position.z-anchor.z)<=anchor.radius&&
        visibleAt(other.root.position.x,other.root.position.z,actor.kind))
        .sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b))[0];
      if(next){
        actor.attackOrder=next;actor.destination=null;actor.route=null;
        actor.navWatch=null;return;
      }
      returnFromDefense(actor);
    }

    function alertVillageUnderAttack(building,attacker){
      if(!attacker||attacker.dead||building.health<=0||
        !enemyOf(attacker,building))return;
      const clan=building.clanId==='orcs'?'orc':'witch';
      const controlled=aiEnabled(clan);
      const center=villageCenter(building);
      const guards=units.filter(u=>u.kind===clan&&!u.dead&&isFighter(u)&&
        !u.raiding&&
        // Preserve explicit orders of a human-controlled guard.
        (controlled||(!u.destination&&(!u.attackOrder||u.defenseAnchor))));
      guards.sort((a,b)=>targetDistance(a,building)-targetDistance(b,building));
      const headquarters=building.type==='barrack'||building.type==='witch-house';
      for(const guard of guards.slice(0,headquarters?8:6)){
        guard.defenseTime=45;
        if(guard.attackOrder===attacker&&guard.defenseAnchor?.buildingId===building.id)continue;
        const p=guard.root.position;
        const local=Math.hypot(p.x-center.x,p.z-center.z)<VILLAGE_DEFENSE_LEASH-4;
        const previous=guard.defenseAnchor?.buildingId===building.id?guard.defenseAnchor:null;
        const approach={x:center.x+Math.cos(guard.id*2.399963)*4,
          z:center.z+Math.sin(guard.id*2.399963)*4};
        guard.defenseAnchor={...center,buildingId:building.id,radius:VILLAGE_DEFENSE_LEASH,
          returnPoint:previous?.returnPoint||(local?{x:p.x,z:p.z}:
            (findSafeGoal(approach)||{x:p.x,z:p.z}))};
        cancelSoulJob(guard);cancelFoodJob(guard);
        guard.ravenDistraction=null;guard.healJob=null;
        guard.scouting=false;guard.attackOrder=attacker;
        guard.destination=null;guard.route=null;guard.routeAge=0;guard.navWatch=null;
        guard.approachCache=null;
      }
      const ratio=building.health/building.maxHealth;
      if(ratio>.72)return;
      const needed=ratio<.4?2:1;
      const repairing=units.filter(u=>u.kind===clan&&!u.dead&&
        u.repairJob?.buildingId===building.id).length;
      if(repairing>=needed)return;
      const workers=units.filter(u=>u.kind===clan&&!u.dead&&isWorker(u)&&
        !u.repairJob&&!u.workerRetryTime&&(ratio<.3||!u.constructJob));
      workers.sort((a,b)=>Number(!!a.constructJob)-Number(!!b.constructJob)||
        targetDistance(a,building)-targetDistance(b,building));
      for(const worker of workers.slice(0,needed-repairing))
        orderRepair([worker],building,{byAI:true});
    }

    return Object.freeze({alertNearbyDefenders,localDefensePost,
      returnFromDefense,updateVillageDefense,alertVillageUnderAttack});
  }

  return Object.freeze({create});
});
