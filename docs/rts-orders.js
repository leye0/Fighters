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
    canAttack,isBuilding,beginRaid,cancelSoulJob,cancelFoodJob}){
    if(!navigation||typeof formationGoals!=='function'||
      typeof cancelMoveWork!=='function'||typeof endRaid!=='function'||
      typeof canAttack!=='function'||typeof isBuilding!=='function'||
      typeof beginRaid!=='function'||typeof cancelSoulJob!=='function'||
      typeof cancelFoodJob!=='function')throw Error('Missing order service');

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

    return Object.freeze({move,attack});
  }

  return Object.freeze({create});
});
