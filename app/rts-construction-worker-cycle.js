/* Fighters RTS — physical builder work, cancellation and completion.
 * Geometry, previews, routing, animation, sound and the match economy remain
 * injected by game.js. Never retain a treasury object across match resets.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersConstructionWorkerCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({pendingBuilds,getGold,getWood,disposeConstructionPreview,
    updateConstructionPreview,distanceToFootprint,buildingContact,
    approachBuilding,navigateActor,markWorkBlocked,animation,faceDirection,
    farmPlant,faceBuildingCenter,workSwing,playEffect,playConstructionHit,
    buildSeconds,buildWitchHouse,buildGarden,buildStoneCircle,buildWall,
    buildOrc,showBanner,refreshHUD}){
    function cancel(actor,refund=true){
      const job=actor.constructJob;
      if(!job)return false;
      disposeConstructionPreview(job);
      actor.constructJob=null;actor.route=null;actor.approachCache=null;
      const index=pendingBuilds.indexOf(job);
      if(index>=0)pendingBuilds.splice(index,1);
      if(refund){getGold()[actor.kind]+=job.cost;
        getWood()[actor.kind]+=job.woodCost;}
      return true;
    }

    function tick(actor,dt){
      const job=actor.constructJob;
      if(!job)return false;
      const isGarden=job.type==='garden';
      const enterSite=isGarden||job.type==='stone-circle';
      const distance=enterSite?
        Math.hypot(actor.root.position.x-job.x,actor.root.position.z-job.z):
        distanceToFootprint(actor.root.position,job.site.hitbox);
      if(distance>(enterSite?.35:buildingContact)){
        const goal=enterSite?{x:job.x,z:job.z}:approachBuilding(actor,job.site);
        if(goal){
          const result=navigateActor(actor,goal,dt,'engage');
          if(result==='blocked'){markWorkBlocked(actor);cancel(actor);animation(actor,'Idle_Loop');return false;}
          if(result!=='moving')animation(actor,'Idle_Loop');
        }else{markWorkBlocked(actor);cancel(actor);animation(actor,'Idle_Loop');return false;}
        return true;
      }
      if(isGarden){
        faceDirection(actor,.6,.8);
        animation(actor,farmPlant);
        job.soundTimer=(job.soundTimer||0)+dt;
        if(job.soundTimer>=1.0){
          job.soundTimer-=1.0;playEffect('garden',actor.root.position);
        }
      }else{
        faceBuildingCenter(actor,job.site);
        animation(actor,workSwing);
        const swingSeconds=Math.max(.35,actor.clipCatalog.get('Sword_Attack')?.duration||1);
        actor.workHitTimer=(actor.workHitTimer||0)+dt;
        if(actor.workHitTimer>=swingSeconds*.4){
          actor.workHitTimer-=swingSeconds;
          playConstructionHit(actor);
        }
      }
      job.progress+=dt;
      updateConstructionPreview(job);
      if(job.progress>=buildSeconds){
        cancel(actor,false);
        const built=job.type==='witch-house'?buildWitchHouse(job.x,job.z,{prepaid:true}):
          job.type==='garden'?buildGarden(job.x,job.z,{prepaid:true}):
          job.type==='stone-circle'?buildStoneCircle(job.x,job.z,{prepaid:true}):
          job.type==='wall'?buildWall(job.x,job.z,{prepaid:true,byAI:job.byAI,axis:job.axis}):
          buildOrc(job.type,job.x,job.z,{prepaid:true,byAI:job.byAI});
        if(!built){getGold()[actor.kind]+=job.cost;
          getWood()[actor.kind]+=job.woodCost;}
        else if(job.byAI)showBanner('CONSTRUCTION TERMINÉE');
        refreshHUD();
      }
      return true;
    }
    return Object.freeze({cancel,tick});
  }
  return Object.freeze({create});
});
