/* Fighters RTS — garden-worker assignment, harvest and physical wheat delivery.
 * Game visuals, navigation, animation, effects and HUD are injected by game.js.
 * The farming economy is stable across resets; the assignment timer is local.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersGardenWorkerCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({units,buildingInstances,farming,roles,targetDistance,
    liveBuildings,buildingContact,approachBuilding,navigateActor,
    markWorkBlocked,animation,faceDirection,farmHarvest,harvestSeconds,
    playEffect,mountCarriedWheat,syncGardenVisual,refreshHUD}){
    let assignmentElapsed=0;

    function reset(){assignmentElapsed=0;}
    function cancel(actor){
      actor.farmJob=null;
      if(actor.carryWheat)actor.carryWheat.visible=false;
    }
    // Walk between the two wheat columns, not to the garden's outer wall.
    function harvestGoal(garden,index){
      const x=index%2===0?-.24:.24;
      const z=(Math.floor(index/2)-1)*1.10;
      return {x:garden.root.position.x+x,z:garden.root.position.z+z};
    }
    function assign(dt){
      assignmentElapsed+=dt;
      if(assignmentElapsed<.75)return;
      assignmentElapsed=0;
      for(const garden of buildingInstances.values()){
        if(garden.type!=='garden'||garden.destroyed||farming.firstReady(garden.id)<0)continue;
        if(units.some(u=>!u.dead&&u.farmJob?.gardenId===garden.id))continue;
        const workers=units.filter(u=>u.kind==='witch'&&!u.dead&&roles.isWorker(u)&&
          !u.constructJob&&!u.repairJob&&!u.mineJob&&!u.farmJob&&!u.treeJob&&!u.woodJob&&
          !u.berryJob&&!u.destination&&!u.workerRetryTime);
        workers.sort((a,b)=>targetDistance(a,garden)-targetDistance(b,garden));
        const worker=workers[0];
        if(!worker)continue;
        worker.farmJob={gardenId:garden.id,plotIndex:-1,progress:0,phase:'harvest',amount:0};
        worker.route=null;worker.approachCache=null;
      }
    }
    function tick(actor,dt){
      const job=actor.farmJob;
      if(!job)return false;
      if(job.retryWait>0){job.retryWait=Math.max(0,job.retryWait-dt);
        animation(actor,'Idle_Loop');return true;}
      const garden=buildingInstances.get(job.gardenId);
      if(!garden||garden.type!=='garden'||garden.destroyed){
        cancel(actor);return false;
      }
      if(job.phase==='carry'){
        const homes=liveBuildings().filter(b=>b.type==='witch-house'&&b.clanId==='witch');
        homes.sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b));
        const home=homes[0];
        if(!home){animation(actor,'Idle_Loop');return true;}
        if(targetDistance(actor,home)>buildingContact){
          const goal=approachBuilding(actor,home);
          if(goal){const status=navigateActor(actor,goal,dt,'engage');
            if(status==='blocked')job.retryWait=5;
            if(status!=='moving')animation(actor,'Idle_Loop');}
          else{job.retryWait=5;animation(actor,'Idle_Loop');}
          return true;
        }
        farming.deliver(job.amount);
        cancel(actor);animation(actor,'Idle_Loop');refreshHUD();
        return true;
      }
      if(job.plotIndex<0){
        const reserved=units.filter(u=>u!==actor&&!u.dead&&
          u.farmJob?.gardenId===garden.id&&u.farmJob.plotIndex>=0)
          .map(u=>u.farmJob.plotIndex);
        job.plotIndex=farming.firstReady(garden.id,reserved);
        job.progress=0;job.harvestSounded=false;
      }
      if(job.plotIndex<0){animation(actor,'Idle_Loop');return true;}
      const goal=harvestGoal(garden,job.plotIndex);
      if(Math.hypot(actor.root.position.x-goal.x,actor.root.position.z-goal.z)>.30){
        const movement=navigateActor(actor,goal,dt,'engage');
        if(movement==='blocked'){markWorkBlocked(actor);cancel(actor);animation(actor,'Idle_Loop');return false;}
        if(movement!=='moving')animation(actor,'Idle_Loop');
        return true;
      }
      const plantX=garden.root.position.x+(job.plotIndex%2===0?-.91:.91);
      const plantZ=garden.root.position.z+(Math.floor(job.plotIndex/2)-1)*1.10;
      faceDirection(actor,plantX-actor.root.position.x,plantZ-actor.root.position.z);
      animation(actor,farmHarvest);
      job.progress+=dt;
      if(!job.harvestSounded&&job.progress>=.4){
        job.harvestSounded=true;playEffect('garden',actor.root.position);
      }
      if(job.progress>=harvestSeconds){
        const yieldAmount=farming.harvest(garden.id,job.plotIndex);
        job.plotIndex=-1;job.progress=0;
        if(yieldAmount){
          job.amount=yieldAmount;job.phase='carry';
          mountCarriedWheat(actor);syncGardenVisual(garden);refreshHUD();
        }
      }
      return true;
    }
    return Object.freeze({reset,cancel,assign,tick});
  }
  return Object.freeze({create});
});
