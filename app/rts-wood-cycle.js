/* Fighters RTS — autonomous logging, physical pickup and wood delivery.
 * Rendering, orders, pathfinding and the match treasury are injected once by
 * game.js. The current wood balance is read at each decision and delivery.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersWoodCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  const TREE_CHOP_SECONDS=4.2,WOOD_PICKUP_SECONDS=1.15;

  function create({units,forestLayout,woodDeposits,roles,fogOfWar,orcAiEnabled,
    witchAiEnabled,getWood,knownEnemyBuildings,enemySpawn,distanceToFootprint,
    liveBuildings,targetDistance,navigatorRTS,unitRadius,buildingContact,
    orderChop,orderCollectWood,placeLogBundle,removeLogBundle,mountCarriedWood,
    hideCarriedWood,creditWood,animation,faceDirection,markWorkBlocked,
    navigateActor,approachBuilding,fellTree,showBanner,refreshHUD,
    farmHarvest,treeChop}){
    function cancel(actor){
      const job=actor.woodJob;
      if(!job)return;
      if(job.phase==='carry'){
        woodDeposits.set(job.index,{amount:job.amount,reservedBy:null});
        placeLogBundle(job.index);
      }else{
        const deposit=woodDeposits.get(job.index);
        if(deposit?.reservedBy===actor.id)deposit.reservedBy=null;
      }
      actor.woodJob=null;
      hideCarriedWood(actor);
    }
    function storeFor(actor){
      const clan=actor.kind==='witch'?'witch':'orcs';
      const homes=liveBuildings().filter(b=>b.clanId===clan&&b.type!=='garden');
      homes.sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b));
      return homes[0]||null;
    }
    function safeWitchWoodLocation(tree){
      if(!tree||!fogOfWar.exploredAt(tree.x,tree.z,'witch'))return false;
      // Keep automatic gatherers out of the Orc village, even before its
      // buildings have been discovered. Also respect any scouted Orc expansion.
      if(Math.hypot(tree.x-enemySpawn.x,tree.z-enemySpawn.z)<11)return false;
      return liveBuildings().every(b=>b.clanId!=='orcs'||
        !knownEnemyBuildings.witch.has(b.id)||
        distanceToFootprint(tree,b.hitbox)>=7);
    }
    function treeChopGoal(actor,tree){
      const radius=tree.radius+unitRadius+.25;
      const origin=actor.root.position;
      const angles=[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,
        5*Math.PI/4,3*Math.PI/2,7*Math.PI/4];
      const options=angles.map(angle=>({x:tree.x+Math.cos(angle)*radius,
        z:tree.z+Math.sin(angle)*radius}));
      options.sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-
        Math.hypot(b.x-origin.x,b.z-origin.z));
      return options.find(goal=>navigatorRTS.pointClear(goal)&&
        (navigatorRTS.segmentClear(origin,goal)||navigatorRTS.plan(origin,goal)))||null;
    }
    function continueWitchWoodRun(actor){
      if(actor.kind!=='witch'||actor.dead||actor.destination||actor.constructJob||
        actor.repairJob||actor.farmJob||actor.mineJob||actor.treeJob||actor.woodJob||
        actor.workerRetryTime)return false;
      if(witchAiEnabled()&&getWood('witch')>=220)return false;
      const candidates=forestLayout.map((tree,index)=>({tree,index,d:
        Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)}))
        .filter(({tree})=>safeWitchWoodLocation(tree))
        .sort((a,b)=>a.d-b.d);
      // Collect already-felled bundles first; only one worker may reserve each.
      for(const {tree,index} of candidates){
        const deposit=woodDeposits.get(index);
        if(!tree.felled||!deposit||deposit.reservedBy||!treeChopGoal(actor,tree))continue;
        if(orderCollectWood([actor],index,{byAI:true}))return true;
      }
      for(const {tree,index} of candidates){
        if(!tree.felled&&treeChopGoal(actor,tree)&&orderChop([actor],index,{byAI:true}))
          return true;
      }
      return false;
    }
    function tickWood(actor,dt){
      const job=actor.woodJob;
      if(!job)return false;
      if(job.retryWait>0){job.retryWait=Math.max(0,job.retryWait-dt);
        animation(actor,'Idle_Loop');return true;}
      if(job.phase==='pickup'){
        const deposit=woodDeposits.get(job.index),tree=forestLayout[job.index];
        if(!deposit||deposit.reservedBy!==actor.id){actor.woodJob=null;return true;}
        if(Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)>1.45){
          if(!job.goal||!navigatorRTS.pointClear(job.goal))job.goal=treeChopGoal(actor,tree);
          if(job.goal){const status=navigateActor(actor,job.goal,dt,'engage');
            if(status==='blocked'){markWorkBlocked(actor);cancel(actor);return false;}
            if(status!=='moving')animation(actor,'Idle_Loop');}
          else{markWorkBlocked(actor);cancel(actor);return false;}
          return true;
        }
        faceDirection(actor,tree.x-actor.root.position.x,tree.z-actor.root.position.z);
        animation(actor,farmHarvest);job.progress+=dt;
        if(job.progress>=WOOD_PICKUP_SECONDS){
          job.amount=deposit.amount;job.phase='carry';job.goal=null;
          woodDeposits.delete(job.index);removeLogBundle(job.index);
          mountCarriedWood(actor);animation(actor,'Idle_Loop');
        }
        return true;
      }
      const home=storeFor(actor);
      if(!home){animation(actor,'Idle_Loop');return true;}
      if(targetDistance(actor,home)>buildingContact){
        const goal=approachBuilding(actor,home);
        if(goal){const status=navigateActor(actor,goal,dt,'engage');
          if(status==='blocked')job.retryWait=5;
          if(status!=='moving')animation(actor,'Idle_Loop');}
        else{job.retryWait=5;animation(actor,'Idle_Loop');}
        return true;
      }
      creditWood(actor,job.amount);
      hideCarriedWood(actor);
      actor.woodJob=null;animation(actor,'Idle_Loop');
      showBanner('BOIS LIVRÉ : +'+job.amount+' 🪵');refreshHUD();
      continueWitchWoodRun(actor);
      return true;
    }
    function assignOrcLumberjack(){
      if(!orcAiEnabled()||getWood('orc')>=140||
        units.some(u=>u.kind==='orc'&&!u.dead&&(u.treeJob||u.woodJob)))return;
      const workers=units.filter(u=>u.kind==='orc'&&roles.isWorker(u)&&!u.dead&&
        !u.constructJob&&!u.repairJob&&!u.farmJob&&!u.destination&&!u.workerRetryTime);
      if(!workers.length)return;
      const candidates=[];
      for(let i=0;i<forestLayout.length;i++){
        const tree=forestLayout[i];
        if(tree.felled||!fogOfWar.exploredAt(tree.x,tree.z,'orc'))continue;
        for(const actor of workers){
          candidates.push({actor,index:i,d:Math.hypot(actor.root.position.x-tree.x,
            actor.root.position.z-tree.z)});
        }
      }
      candidates.sort((a,b)=>a.d-b.d);
      for(const {actor,index} of candidates.slice(0,12)){
        const goal=treeChopGoal(actor,forestLayout[index]);
        if(goal&&orderChop([actor],index,{byAI:true}))return;
      }
    }
    function assignWitchLumberjack(){
      if(!witchAiEnabled()||getWood('witch')>=180||
        units.some(u=>u.kind==='witch'&&!u.dead&&(u.treeJob||u.woodJob)))return;
      const workers=units.filter(u=>u.kind==='witch'&&roles.isWorker(u)&&!u.dead&&
        !u.constructJob&&!u.repairJob&&!u.farmJob&&!u.mineJob&&!u.destination&&
        !u.workerRetryTime);
      if(!workers.length)return;
      const candidates=[];
      for(let index=0;index<forestLayout.length;index++){
        const tree=forestLayout[index];
        if(tree.felled||!safeWitchWoodLocation(tree))continue;
        for(const actor of workers)candidates.push({actor,index,
          distance:Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)});
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      for(const {actor,index} of candidates.slice(0,15)){
        if(treeChopGoal(actor,forestLayout[index])&&orderChop([actor],index,{byAI:true}))return;
      }
    }
    function tickTree(actor,dt){
      const job=actor.treeJob;
      if(!job)return false;
      const tree=forestLayout[job.index];
      if(!tree||tree.felled){actor.treeJob=null;animation(actor,'Idle_Loop');return true;}
      const reach=tree.radius+unitRadius+.35;
      if(Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)>reach){
        if(!job.goal||!navigatorRTS.pointClear(job.goal))
          job.goal=treeChopGoal(actor,tree);
        if(!job.goal){markWorkBlocked(actor);actor.treeJob=null;animation(actor,'Idle_Loop');return true;}
        const status=navigateActor(actor,job.goal,dt,'engage');
        if(status==='blocked'){markWorkBlocked(actor);actor.treeJob=null;animation(actor,'Idle_Loop');return false;}
        if(status!=='moving')animation(actor,'Idle_Loop');
        return true;
      }
      faceDirection(actor,tree.x-actor.root.position.x,tree.z-actor.root.position.z);
      animation(actor,treeChop);
      job.progress+=dt;
      if(job.progress>=TREE_CHOP_SECONDS){
        fellTree(job.index);actor.treeJob=null;
        animation(actor,'Idle_Loop');showBanner('BRASSÉE DE BÛCHES');
        orderCollectWood([actor],job.index,{byAI:true});
      }
      return true;
    }
    return Object.freeze({cancel,storeFor,assignOrcLumberjack,
      assignWitchLumberjack,tickWood,tickTree});
  }
  return Object.freeze({create});
});
