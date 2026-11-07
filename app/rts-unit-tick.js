/* Fighters RTS — unit state transitions at the fixed simulation tick.
 * All rendering, navigation, audio and faction decisions are injected once.
 * Neither the browser DOM nor Three.js is required to test these rules.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersUnitTick=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({units,getPassiveKind,orcDirector,witchDirector,roles,raiding,
    buildingContact,cancelOrcFoodJob,enemyOf,isBuilding,faceBuildingCenter,
    faceTarget,targetDistance,dealDamage,interceptMagicWithWall,playEffect,
    animation,tickRavenDistraction,updateVillageDefense,nextRaidBuilding,
    liveBuildings,tickHealingRetreat,tickSoulHarvester,tickBerryForager,
    tickOrcForager,tickConstructWorker,tickRepairWorker,tickMineWorker,
    tickTreeWorker,tickWoodWorker,tickGardenWorker,navigateActor,nearestHostile,
    returnFromDefense,approachBuilding,fireBolt,rand}){
    if(!Array.isArray(units)||typeof getPassiveKind!=='function'||
      !raiding||typeof raiding.retaliation!=='function'||
      typeof raiding.end!=='function'||typeof navigateActor!=='function')
      throw Error('Missing unit tick service');

    function tickUnit(actor,dt){
      if(actor.dead){
        if(actor.orcFoodJob)cancelOrcFoodJob(actor);
        actor.deadTime-=dt;return;
      }
      if(getPassiveKind()===actor.kind)return;
      actor.defenseTime=Math.max(0,(actor.defenseTime||0)-dt);
      actor.workerRetryTime=Math.max(0,actor.workerRetryTime-dt);
      actor.unreachableTime=Math.max(0,actor.unreachableTime-dt);
      if(!actor.unreachableTime)actor.unreachableTarget=null;
      actor.approachAge+=dt;
      actor.stun=Math.max(0,actor.stun-dt);actor.cooldown=Math.max(0,actor.cooldown-dt);
      if(actor.attack){
        // Keep a local action if an impact destroys its target and clears it.
        const action=actor.attack;
        action.elapsed+=dt;
        if(enemyOf(actor,action.target)){
          if(isBuilding(action.target))faceBuildingCenter(actor,action.target);
          else faceTarget(actor,action.target);
        }
        if(!action.landed&&action.elapsed>=action.impact){
          action.landed=true;
          const target=action.target;
          const range=actor.role==='ranged'?actor.profile.range+.3:
            isBuilding(target)?buildingContact+.22:actor.weapon?2.35:1.85;
          if(enemyOf(actor,target)&&targetDistance(actor,target)<range){
            dealDamage(interceptMagicWithWall(actor,target),actor.profile.damage,actor);
            if(actor.weapon&&actor.role!=='ranged')
              playEffect('swordHit',actor.root.position);
          }
        }
        if(actor.attack===action&&action.elapsed>=action.duration){
          actor.attack=null;animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop',true);
        }
        return;
      }
      if(actor.stun>0)return;
      if(!actor.raiding&&tickRavenDistraction(actor,dt))return;
      if(actor.attackOrder&&!enemyOf(actor,actor.attackOrder))actor.attackOrder=null;
      if(!actor.orcFoodJob)updateVillageDefense(actor);
      if(actor.raiding&&!actor.attackOrder&&!actor.orcFoodJob){
        actor.attackOrder=nextRaidBuilding(actor);
        if(actor.attackOrder){
          actor.destination=null;actor.route=null;actor.navWatch=null;
          actor.approachCache=null;
        }else if(!liveBuildings().some(b=>enemyOf(actor,b)))
          raiding.end(actor);
      }
      if(tickHealingRetreat(actor,dt))return;
      if(tickSoulHarvester(actor,dt))return;
      if(tickBerryForager(actor,dt))return;
      if(tickOrcForager(actor,dt))return;
      if(roles.isWorker(actor)){
        if(tickConstructWorker(actor,dt)||tickRepairWorker(actor,dt)||tickMineWorker(actor,dt)||
          tickTreeWorker(actor,dt)||tickWoodWorker(actor,dt)||tickGardenWorker(actor,dt))return;
        if(actor.destination){
          const result=navigateActor(actor,actor.destination,dt,'order');
          if(result==='arrived'){actor.destination=null;actor.route=null;}
          if(result==='blocked'){actor.destination=null;actor.route=null;actor.navWatch=null;}
          if(result!=='moving')animation(actor,'Idle_Loop');
        }else animation(actor,'Idle_Loop');
        return;
      }
      const retaliation=raiding.retaliation(actor,enemyOf);
      const explicit=retaliation||actor.attackOrder;
      // Explicit orders already specify a target: skip expensive nearby scans.
      const nearby=explicit?null:nearestHostile(actor,actor.profile.sight);
      const target=explicit||(nearby&&(!actor.destination||nearby.distance<2.7)?nearby.target:null);
      const playerControlled=actor.kind==='witch'?!witchDirector.enabled:!orcDirector.enabled;
      const groupDefense=playerControlled&&
        !explicit&&!actor.destination&&
        nearby&&units.some(ally=>ally!==actor&&ally.kind===actor.kind&&!ally.dead&&
          Math.hypot(ally.root.position.x-actor.root.position.x,
            ally.root.position.z-actor.root.position.z)<=5.5);
      if(target){
        const distance=targetDistance(actor,target),
          range=actor.role==='ranged'?actor.profile.range:
            isBuilding(target)?buildingContact:actor.weapon?2.1:actor.profile.range;
        if(distance<=range){
          if(isBuilding(target))faceBuildingCenter(actor,target);
          else faceTarget(actor,target);
          if(actor.cooldown>0){
            animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
            return;
          }
          const clipName=actor.weapon&&actor.clipCatalog.has('Sword_Attack')?'Sword_Attack':'Punch_Jab';
          const clip=actor.clipCatalog.get(clipName);
          if(clip){
            const duration=clip.duration;
            actor.attack={target,elapsed:0,impact:duration*.4,duration:duration+.13,landed:false};
            actor.cooldown=duration+rand(.45,.85);animation(actor,clipName,true);
            if(actor.weapon&&actor.role!=='ranged')
              playEffect('swordSwing',actor.root.position);
            if(actor.role==='ranged')fireBolt(actor,target,duration*.4);
          }
          return;
        }
        if(groupDefense){
          if(isBuilding(target))faceBuildingCenter(actor,target);
          else faceTarget(actor,target);
          animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
          return;
        }
        const location=isBuilding(target)?approachBuilding(actor,target):target.root.position;
        if(location){
          const result=navigateActor(actor,location,dt,isBuilding(target)?'engage':'pursuit');
          if(result==='blocked'){
            actor.unreachableTarget=target;actor.unreachableTime=6;
            actor.navWatch=null;actor.route=null;actor.approachCache=null;
            if(retaliation===target){
              actor.retaliationTarget=null;actor.retaliationOrigin=null;
            }
            if(actor.attackOrder===target)actor.attackOrder=null;
            if(actor.defenseAnchor)returnFromDefense(actor);
          }
          if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
          return;
        }
      }
      if(actor.destination){
        const result=navigateActor(actor,actor.destination,dt,'order');
        if(result==='arrived'){actor.destination=null;actor.route=null;}
        if(result==='blocked'){actor.destination=null;actor.route=null;actor.navWatch=null;}
        if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
      }else animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
    }
    return tickUnit;
  }

  return Object.freeze({create});
});
