/* Fighters RTS — autonomous Witch soul-harvesting assignments and work.
 * An injected renderer creates the actual 3D soul effect; this module owns
 * only actor/corpse reservations, work cadence and the path to each body.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSoulHarvester=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({units,soulRules,getWitchMagic,nearestHostile,fogOfWar,
    navigatorRTS,navigateActor,markWorkBlocked,animation,faceDirection,
    playWitchVoice,beginSoulEffect}){
    let assignmentElapsed=0;
    function reset(){assignmentElapsed=0;}
    function cancel(actor){
      const corpse=actor.soulJob;
      if(corpse?.soulReservedBy===actor.id)corpse.soulReservedBy=null;
      actor.soulJob=null;
    }
    function assign(dt){
      if(getWitchMagic()>=soulRules.MAX_MAGIC)return;
      assignmentElapsed+=dt;
      if(assignmentElapsed<.65)return;
      assignmentElapsed=0;
      for(const mage of units){
        if(mage.kind!=='witch'||mage.role!=='ranged'||mage.dead||mage.soulJob||
          mage.raiding||mage.destination||mage.attackOrder||mage.attack||mage.healJob||mage.berryJob||
          mage.workerRetryTime||nearestHostile(mage,5)?.target)continue;
        const position=mage.root.position;
        const available=units.filter(unit=>unit.dead).map(unit=>({
          id:unit.id,x:unit.root.position.x,z:unit.root.position.z,
          dead:true,deadTime:unit.deadTime,soulClaimed:unit.soulClaimed,
          soulReservedBy:unit.soulReservedBy
        }));
        const nearest=soulRules.nearestSoul(position,available,corpse=>
          fogOfWar.visibleAt(corpse.x,corpse.z,'witch')&&
          (navigatorRTS.segmentClear(position,corpse)||!!navigatorRTS.plan(position,corpse)));
        if(!nearest)continue;
        const corpse=units.find(unit=>unit.id===nearest.id);
        corpse.soulReservedBy=mage.id;mage.soulJob=corpse;
      }
    }
    function tick(actor,dt){
      const corpse=actor.soulJob;
      if(!corpse)return false;
      if(corpse.deadTime<=0||!corpse.dead||corpse.soulClaimed||
        actor.destination||actor.attackOrder||actor.attack||
        nearestHostile(actor,5)?.target){cancel(actor);return false;}
      const position=corpse.root.position;
      if(Math.hypot(actor.root.position.x-position.x,actor.root.position.z-position.z)>
        soulRules.SOUL_APPROACH){
        const status=navigateActor(actor,position,dt,'engage');
        if(status==='blocked'){markWorkBlocked(actor);cancel(actor);}
        if(status!=='moving')animation(actor,'Idle_Loop');
        return status!=='blocked';
      }
      faceDirection(actor,position.x-actor.root.position.x,
        position.z-actor.root.position.z);
      // Copy only the actual settled Death01 body; preserve the full 3D soul.
      if(corpse.current==='Death01'&&corpse.action?.isRunning()){
        animation(actor,'Idle_Loop');return true;
      }
      corpse.soulClaimed=true;cancel(actor);
      animation(actor,'Idle_Loop');
      playWitchVoice('interaction',actor);
      beginSoulEffect(corpse,actor);
      return true;
    }
    return Object.freeze({cancel,assign,tick,reset});
  }

  return Object.freeze({create});
});
