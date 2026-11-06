/* Fighters RTS — worker mining assignments, extraction and ore delivery.
 * The match treasury, 3D cargo and movement services remain injected by the
 * integration layer. No mutable resource object is captured across resets.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersMiningCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  const MINING_SECONDS=4.5,MINING_PAY=60;

  function canMine(actor,mine,isWorker){
    return isWorker(actor)&&mine?.type==='mine'&&
      mine.clanId==='neutral'&&!mine.destroyed;
  }

  function create({units,buildingInstances,roles,fogOfWar,isRunning,
    directorEnabled,targetDistance,acknowledgeOrcAiOrder,unitFaction,
    liveBuildings,woodStoreFor,buildingContact,approachBuilding,navigateActor,
    markWorkBlocked,animation,faceBuildingCenter,workSwing,playEffect,
    mountCarriedGold,hideCarriedGold,creditGold,refreshHUD}){
    function cancel(actor){
      actor.mineJob=null;
      hideCarriedGold(actor);
    }
    function goldStoreFor(actor){
      const clan=unitFaction(actor),preferred=actor.kind==='witch'?'witch-house':'barrack';
      const stores=liveBuildings().filter(b=>b.clanId===clan&&b.type===preferred);
      stores.sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b));
      return stores[0]||woodStoreFor(actor);
    }
    function assign(clan='orc'){
      if(!isRunning()||!directorEnabled(clan))return;
      const mines=[...buildingInstances.values()].filter(b=>b.type==='mine'&&
        b.clanId==='neutral'&&!b.destroyed&&
        (clan==='orc'||fogOfWar.exploredAt(b.root.position.x,b.root.position.z,clan)));
      const workers=units.filter(u=>u.kind===clan&&roles.isWorker(u)&&!u.dead&&
        !u.constructJob&&!u.repairJob&&!u.treeJob&&!u.woodJob&&!u.farmJob&&
        !u.workerRetryTime);
      const limit=Math.min(mines.length,Math.max(1,Math.floor(workers.length/3)));
      let assigned=workers.filter(u=>u.mineJob&&mines.some(b=>b.id===u.mineJob.mineId));
      for(const worker of workers){
        if(worker.mineJob&&!mines.some(m=>m.id===worker.mineJob.mineId))cancel(worker);
      }
      assigned=workers.filter(u=>u.mineJob);
      if(assigned.length>=limit)return;
      const needed=mines.filter(m=>!assigned.some(u=>u.mineJob.mineId===m.id));
      for(const mine of needed){
        if(assigned.length>=limit)break;
        const available=workers.filter(u=>!u.mineJob&&!u.constructJob&&!u.destination&&
          !u.berryJob&&!u.soulJob);
        available.sort((a,b)=>targetDistance(a,mine)-targetDistance(b,mine));
        const miner=available[0];
        if(!miner)continue;
        miner.mineJob={mineId:mine.id,phase:'extract',progress:0,cycles:0,amount:0};
        miner.route=null;miner.approachCache=null;
        assigned.push(miner);
        if(clan==='orc')acknowledgeOrcAiOrder([miner]);
      }
    }
    function tick(actor,dt){
      const job=actor.mineJob;
      if(!job)return false;
      if(job.retryWait>0){job.retryWait=Math.max(0,job.retryWait-dt);
        animation(actor,'Idle_Loop');return true;}
      const mine=buildingInstances.get(job.mineId);
      if(!canMine(actor,mine,roles.isWorker)){cancel(actor);return false;}
      // Workers are economic units: they never acquire combat targets.
      if(job.phase==='carry'){
        const store=goldStoreFor(actor);
        if(!store){animation(actor,'Idle_Loop');return true;}
        if(targetDistance(actor,store)>buildingContact){
          const goal=approachBuilding(actor,store);
          if(goal){const status=navigateActor(actor,goal,dt,'engage');
            if(status==='blocked')job.retryWait=5;
            if(status!=='moving')animation(actor,'Idle_Loop');}
          else{job.retryWait=5;animation(actor,'Idle_Loop');}
          return true;
        }
        // No income exists in transit: resources enter the treasury at delivery.
        creditGold(actor,job.amount);
        job.amount=0;job.phase='extract';job.progress=0;job.cycles++;
        hideCarriedGold(actor);
        actor.route=null;actor.approachCache=null;
        animation(actor,'Idle_Loop');refreshHUD();return true;
      }
      const reach=targetDistance(actor,mine);
      if(reach>buildingContact){
        const goal=approachBuilding(actor,mine);
        if(!goal){markWorkBlocked(actor);cancel(actor);return false;}
        const status=navigateActor(actor,goal,dt,'engage');
        if(status==='blocked'){markWorkBlocked(actor);cancel(actor);return false;}
        // Mining is a physical contact task, not a loose formation move.
        // The order-mode .36m arrival tolerance left workers .2m beyond reach.
        if(status!=='moving')animation(actor,'Idle_Loop');
        return true;
      }
      // Extract at the mine, then transport the ore to an allied headquarters.
      faceBuildingCenter(actor,mine);
      animation(actor,workSwing);
      job.soundTimer=(job.soundTimer||0)+dt;
      if(job.soundTimer>=.78){
        job.soundTimer-=.78;playEffect('mine',actor.root.position);
      }
      job.progress+=dt;
      if(job.progress>=MINING_SECONDS){
        job.progress=0;job.phase='carry';job.amount=MINING_PAY*mine.level;
        actor.route=null;actor.approachCache=null;
        mountCarriedGold(actor);animation(actor,'Idle_Loop');
      }
      return true;
    }
    return Object.freeze({assign,tick,cancel});
  }
  return Object.freeze({create,canMine});
});
