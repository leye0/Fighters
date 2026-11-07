/* Fighters RTS — physical Orc hare/corpse work order.
 * The model, navigation, sound/animation and economy are injected once.
 * No DOM, Three.js, or global game state is read here.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersOrcForager=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({hareField,orcFood,orcFoodRules,units,nearestHostile,
    navigateActor,markWorkBlocked,animation,faceDirection,cancelSoulJob,
    refreshHUD,harvestAnimation}){
    function cancel(actor){
      if(actor.orcFoodJob?.kind==='hare')
        hareField.release(actor.orcFoodJob.id,actor.id);
      actor.orcFoodJob=null;
    }
    function tick(actor,dt){
      const job=actor.orcFoodJob;
      if(!job)return false;
      if(actor.attackOrder||actor.destination||actor.attack||actor.constructJob||
        actor.repairJob||actor.mineJob||actor.treeJob||actor.woodJob||
        nearestHostile(actor,8)?.target){cancel(actor);return false;}
      const target=job.kind==='hare'?hareField.hares[job.id]:
        units.find(u=>u.id===job.id);
      const edible=job.kind==='hare'?(target?.active&&
        (target.caughtBy==null||target.caughtBy===actor.id)):
        target?.kind==='witch'&&target.dead&&target.deadTime>0;
      if(!edible){cancel(actor);return false;}
      const position=job.kind==='hare'?target:target.root.position;
      const catchDistance=job.kind==='hare'?orcFoodRules.HARE_CAPTURE_DISTANCE:.8;
      if(Math.hypot(actor.root.position.x-position.x,actor.root.position.z-position.z)>catchDistance){
        job.progress=0;
        const result=navigateActor(actor,position,dt,'engage');
        if(result==='blocked'){markWorkBlocked(actor);cancel(actor);}
        if(result!=='moving')animation(actor,'Idle_Loop');
        return true;
      }
      if(job.kind==='hare'&&target.caughtBy==null&&!hareField.catch(job.id,actor.id)){
        cancel(actor);return false;
      }
      faceDirection(actor,position.x-actor.root.position.x,position.z-actor.root.position.z);
      animation(actor,harvestAnimation);
      job.progress+=dt;
      if(job.progress>=orcFoodRules.EAT_SECONDS){
        if(job.kind==='hare'){
          if(hareField.eat(job.id))orcFood.eatHare();
        }else if(orcFood.eatCorpse(target.id)){
          target.deadTime=0;
          for(const mage of units)if(mage.soulJob===target)cancelSoulJob(mage);
        }
        cancel(actor);animation(actor,'Idle_Loop');refreshHUD();
      }
      return true;
    }
    return Object.freeze({cancel,tick});
  }

  return Object.freeze({create});
});
