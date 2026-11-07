/* Fighters RTS — domain-side unit orders; no DOM, WebGL or audio dependencies. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersOrders=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  // Bind external services once, during boot. UI input and AI can issue the
  // same orders without duplicating the state transitions of an actor.
  function create({navigation,formationGoals,cancelMoveWork,endRaid,
    canAttack,isBuilding,beginRaid,cancelSoulJob,cancelFoodJob,cancelStopWork}){
    if(!navigation||typeof formationGoals!=='function'||
      typeof cancelMoveWork!=='function'||typeof endRaid!=='function'||
      typeof canAttack!=='function'||typeof isBuilding!=='function'||
      typeof beginRaid!=='function'||typeof cancelSoulJob!=='function'||
      typeof cancelFoodJob!=='function'||typeof cancelStopWork!=='function')
      throw Error('Missing order service');

    function move(actors,destination,{spacing=1.35,withinRadius=Infinity}={}){
      for(const actor of actors)cancelMoveWork(actor);
      const goals=formationGoals(actors,destination,navigation,{spacing});
      actors.forEach((actor,i)=>{
        let goal=goals[i];
        // A sanctuary's centre can override coarse formation spreading.
        if(!goal&&withinRadius<Infinity&&navigation.pointClear(destination))
          goal={...destination};
        if(goal&&Math.hypot(goal.x-destination.x,goal.z-destination.z)>withinRadius&&
          (navigation.segmentClear(actor.root.position,destination)||
            navigation.plan(actor.root.position,destination)))goal={...destination};
        actor.destination=goal;
        actor.attackOrder=null;actor.approachCache=null;
        endRaid(actor);
        actor.route=null;actor.routeVersion=-1;actor.routeAge=0;
        actor.defenseAnchor=null;actor.navWatch=null;actor.unreachableTarget=null;
      });
      return actors.length;
    }

    function attack(actors,target){
      let issued=0;
      for(const actor of actors){
        if(!canAttack(actor,target))continue;
        cancelSoulJob(actor);
        cancelFoodJob(actor);
        actor.attackOrder=target;actor.destination=null;actor.route=null;actor.routeAge=0;
        if(isBuilding(target))beginRaid(actor);
        else endRaid(actor);
        actor.berryJob=null;actor.healJob=null;actor.ravenDistraction=null;
        actor.defenseAnchor=null;actor.navWatch=null;
        actor.unreachableTarget=null;actor.unreachableTime=0;
        actor.approachCache=null;
        issued++;
      }
      return issued;
    }

    function stop(actors){
      for(const actor of actors){
        cancelSoulJob(actor);
        cancelStopWork(actor);
        actor.destination=null;actor.attackOrder=null;actor.route=null;
      }
      return actors.length;
    }

    return Object.freeze({move,attack,stop});
  }

  // The same worker-order transitions are used by taps and the faction AIs.
  // Keep world effects (sounds, banners, HUD, payment) in the game adapter.
  function createWorkerOrders({canRepair,isWorker,canMine,cancelConstruction,
    cancelWoodJob,cancelRepair,cancelFarmJob,cancelSoulJob,cancelFoodJob,cancelMineJob}){
    if([canRepair,isWorker,canMine,cancelConstruction,cancelWoodJob,cancelRepair,
      cancelFarmJob,cancelSoulJob,cancelFoodJob,cancelMineJob].some(fn=>typeof fn!=='function'))
      throw Error('Missing worker order service');

    function repair(actors,building,{byAI=false}={}){
      let assigned=0;
      for(const actor of actors){
        if(!canRepair(actor,building)||(byAI&&actor.workerRetryTime>0))continue;
        cancelConstruction(actor);cancelWoodJob(actor);cancelFarmJob(actor);
        cancelSoulJob(actor);cancelFoodJob(actor);
        cancelMineJob(actor);actor.treeJob=null;actor.berryJob=null;actor.healJob=null;
        actor.repairJob={buildingId:building.id};actor.workHitTimer=0;
        actor.destination=null;actor.attackOrder=null;actor.route=null;
        actor.routeVersion=-1;actor.routeAge=0;actor.approachCache=null;
        assigned++;
      }
      return assigned;
    }

    function mine(actors,building){
      if(!building||building.type!=='mine')return 0;
      let assigned=0;
      for(const actor of actors){
        if(!canMine(actor,building))continue;
        cancelConstruction(actor);cancelWoodJob(actor);cancelRepair(actor);
        cancelFarmJob(actor);actor.treeJob=null;actor.berryJob=null;
        cancelMineJob(actor);
        actor.mineJob={mineId:building.id,phase:'extract',progress:0,cycles:0,amount:0};
        actor.destination=null;actor.route=null;actor.approachCache=null;
        assigned++;
      }
      return assigned;
    }

    function collectWood(actors,index,deposit){
      if(!deposit)return 0;
      for(const actor of actors){
        if(actor.dead||!isWorker(actor)||
          (deposit.reservedBy&&deposit.reservedBy!==actor.id))continue;
        cancelConstruction(actor);cancelWoodJob(actor);cancelRepair(actor);
        cancelMineJob(actor);cancelFarmJob(actor);actor.treeJob=null;actor.berryJob=null;
        actor.woodJob={index,phase:'pickup',progress:0,amount:0,goal:null};
        deposit.reservedBy=actor.id;
        actor.destination=null;actor.attackOrder=null;actor.route=null;
        actor.approachCache=null;
        return 1; // A physical bundle can be reserved by only one worker.
      }
      return 0;
    }

    function chop(actors,index,tree){
      if(!tree||tree.felled)return 0;
      let assigned=0;
      for(const actor of actors){
        if(actor.dead||!isWorker(actor))continue;
        cancelConstruction(actor);cancelWoodJob(actor);cancelRepair(actor);
        cancelMineJob(actor);cancelFarmJob(actor);actor.berryJob=null;
        actor.treeJob={index,progress:0,goal:null};
        actor.destination=null;actor.attackOrder=null;actor.route=null;
        actor.approachCache=null;assigned++;
      }
      return assigned;
    }

    function harvest(actors,garden){
      if(!garden||garden.type!=='garden'||garden.destroyed)return 0;
      let assigned=0;
      for(const actor of actors){
        if(actor.kind!=='witch'||actor.dead||!isWorker(actor))continue;
        cancelConstruction(actor);cancelWoodJob(actor);cancelRepair(actor);
        cancelMineJob(actor);actor.treeJob=null;actor.berryJob=null;
        cancelFarmJob(actor);
        actor.farmJob={gardenId:garden.id,plotIndex:-1,progress:0,phase:'harvest',amount:0};
        actor.destination=null;actor.attackOrder=null;actor.route=null;actor.approachCache=null;
        assigned++;
      }
      return assigned;
    }

    return Object.freeze({repair,mine,collectWood,chop,harvest});
  }

  // Site validation and preview creation remain in the world adapter. This
  // transaction selects one eligible builder, pays once and owns its work job.
  function createConstructionOrders({units,selected,isWorker,pendingBuilds,
    getGold,getWood,cancelWoodJob,cancelRepair,cancelMineJob,cancelFarmJob,
    acknowledgeOrcAiOrder,acknowledgePlayerOrder}){
    function assign({clan,x,z,cost,woodCost,byAI=false,createJob}){
      const candidates=units.filter(actor=>actor.kind===clan&&isWorker(actor)&&!actor.dead&&
        !actor.constructJob&&(!byAI||(!actor.repairJob&&!actor.workerRetryTime)));
      const preferred=candidates.filter(actor=>selected.has(actor));
      const available=preferred.length?preferred:candidates;
      available.sort((a,b)=>Math.hypot(a.root.position.x-x,a.root.position.z-z)-
        Math.hypot(b.root.position.x-x,b.root.position.z-z));
      const worker=available[0];
      if(!worker)return false;
      const job=createJob(worker);
      const gold=getGold(),wood=getWood();
      pendingBuilds.push(job);gold[clan]-=cost;wood[clan]-=woodCost;
      cancelWoodJob(worker);cancelRepair(worker);
      cancelMineJob(worker);cancelFarmJob(worker);worker.treeJob=null;worker.berryJob=null;
      worker.constructJob=job;worker.destination=null;
      worker.workHitTimer=0;
      worker.attackOrder=null;worker.route=null;worker.approachCache=null;
      if(clan==='orc'&&byAI)acknowledgeOrcAiOrder([worker]);
      else if(!byAI)acknowledgePlayerOrder([worker]);
      return true;
    }
    return Object.freeze({assign});
  }

  function createProductionOrders({roles,trainingDuration,upgradeCost,
    arcanistUnlocked,canTrainOrcRole,maxQueue,getGold,getWood,
    liveBuildings=()=>[],finishUpgrade=()=>{},finishTraining=()=>{}}){
    function queue(building,kind,role='melee',{running,paused}){
      if(!running||paused||!building||building.destroyed||building.clanId==='neutral'||
        building.type==='mine'||building.queue.length>=maxQueue)return false;
      const faction=building.clanId==='witch'?'witch':'orc';
      if(kind==='witch'&&(faction!=='witch'||building.type!=='witch-house')||
         kind==='orc'&&(faction!=='orc'||building.type!=='barrack'))return false;
      if(kind==='witch'&&role==='ranged'&&!arcanistUnlocked())return false;
      if(kind==='orc'&&!canTrainOrcRole(role))return false;
      let cost,duration,woodCost=0;
      if(kind==='upgrade'){
        if(building.level+building.queue.filter(job=>job.kind==='upgrade').length>=3)
          return false;
        cost=upgradeCost(building);woodCost=40;duration=6+building.level*2;
      }else{
        cost=roles.profile(faction,role).cost;
        duration=trainingDuration(building,kind,role);
      }
      const gold=getGold(),wood=getWood();
      if(cost===null||gold[faction]<cost||wood[faction]<woodCost)return false;
      gold[faction]-=cost;wood[faction]-=woodCost;
      building.queue.push({kind,role:kind==='upgrade'?null:role,cost,woodCost,duration});
      return true;
    }

    function cancel(building,index){
      if(!building?.queue[index])return false;
      const [order]=building.queue.splice(index,1);
      const clan=building.clanId==='witch'?'witch':'orc';
      const gold=getGold(),wood=getWood();
      gold[clan]+=order.cost;wood[clan]+=order.woodCost||0;
      if(index===0){building.progress=0;building.spawnBlocked=false;}
      return true;
    }

    function step(dt){
      for(const building of liveBuildings()){
        if(!building.queue.length){building.progress=0;continue;}
        building.progress+=dt;
        const order=building.queue[0];
        if(building.progress+1e-9<order.duration)continue;
        building.progress=Math.max(0,building.progress-order.duration);
        building.queue.shift();
        if(order.kind==='upgrade')finishUpgrade(building);
        // Preserve the historical callback order (queue already shifted)
        // while retaining a paid recruit if no forward exit is reachable.
        else if(finishTraining(building,order.kind,order.role||'melee')===false){
          building.queue.unshift(order);building.progress=order.duration;
        }
      }
    }

    return Object.freeze({queue,cancel,step});
  }

  // A completed order changes domain state here. The world adapter alone
  // chooses a collision-free spawn, creates 3D actors and applies visuals,
  // sounds and notifications. Callback order matches the historical game.
  function createProductionCompletions({safeSpawn,spawnActor,countActors,
    resolveRally,playCreationVoice,profile,showBanner,witchHouseHealth,
    orcLevelHealth,updateHealthBar,showOrcLevelModel,refreshHUD}){
    const services=[safeSpawn,spawnActor,countActors,resolveRally,playCreationVoice,
      profile,showBanner,orcLevelHealth,updateHealthBar,showOrcLevelModel,refreshHUD];
    if(services.some(service=>typeof service!=='function')||
      !Number.isFinite(witchHouseHealth))throw Error('Missing production completion service');

    function finishTraining(building,kind,role='melee'){
      const position=safeSpawn(building);
      if(!position){
        if(!building.spawnBlocked)showBanner('SORTIE BLOQUÉE');
        building.spawnBlocked=true;return false;
      }
      building.spawnBlocked=false;
      const actor=spawnActor(kind,position,countActors(kind),role);
      if(building.rally)actor.destination=resolveRally(building.rally);
      if(kind==='orc'||kind==='witch')playCreationVoice(kind,actor);
      showBanner(role==='melee'?(kind==='witch'?'SORCIÈRE FORMÉE':'ORC FORMÉ'):
        profile(kind,role).name.toUpperCase()+' FORMÉ(E)');
      return true;
    }

    function finishUpgrade(building){
      if(['mine','garden','stone-circle'].includes(building.type)||
        building.clanId==='neutral'||building.level>=3)return false;
      const previousHealth=building.maxHealth;
      building.level++;
      building.maxHealth=building.clanId==='witch'?
        witchHouseHealth+750*(building.level-1):
        orcLevelHealth(building.type,building.level);
      building.health=Math.min(building.maxHealth,
        building.health+(building.maxHealth-previousHealth));
      if(building.healthBar)updateHealthBar(building);
      if(building.clanId==='orcs')showOrcLevelModel(building,building.level);
      showBanner('AMÉLIORATION NIVEAU '+building.level);
      refreshHUD();
      return true;
    }

    return Object.freeze({finishTraining,finishUpgrade});
  }

  return Object.freeze({create,createWorkerOrders,createConstructionOrders,
    createProductionOrders,createProductionCompletions});
});
