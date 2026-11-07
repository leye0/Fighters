/* Fighters RTS — deterministic Orc food-job assignment.
 * The planner owns only its cadence; prey, paths, fog and actors are provided
 * by the match integration. Physical capture is handled by rts-orc-forager.js.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersOrcHuntPlanner=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({units,orcFood,orcFoodRules,hareField,fogOfWar,navigatorRTS,
    nearestHostile,isOrcPassive,isOrcDirectorEnabled}){
    let elapsed=0;
    function reset(){elapsed=0;}
    function assign(dt){
      if(isOrcPassive())return;
      elapsed+=dt;
      if(elapsed<.8)return;
      elapsed=0;
      const orcs=units.filter(u=>u.kind==='orc'&&!u.dead);
      // Corpse meals are opportunistic even with a full stockpile. Hares are
      // hunted before starvation, without pulling soldiers out of a real fight.
      const huntHares=orcFood.food<Math.max(60,orcs.length*12);
      let jobs=orcs.filter(u=>u.orcFoodJob).length;
      if(jobs>=2)return;
      const candidates=orcs.filter(u=>!u.orcFoodJob&&!u.attack&&
        !u.raiding&&!u.attackOrder&&(!u.destination||isOrcDirectorEnabled()&&u.scouting)&&
        !u.constructJob&&!u.repairJob&&!u.mineJob&&
        !u.treeJob&&!u.woodJob&&!u.farmJob&&!u.ravenDistraction&&
        !u.workerRetryTime&&!nearestHostile(u,8)?.target);
      // Fallen witches are a substantial, finite meal, preferred over live hares.
      const prey=[...units.filter(u=>u.kind==='witch'&&u.dead&&u.deadTime>2&&
        !orcFood.consumedCorpses.has(u.id)).map(u=>({
        kind:'corpse',id:u.id,x:u.root.position.x,z:u.root.position.z
      }))];
      if(huntHares)prey.push(...hareField.hares.filter(h=>h.active&&h.caughtBy==null).map(h=>({
        kind:'hare',id:h.id,x:h.x,z:h.z
      })));
      // Try the closest reachable meals first, while keeping fallen witches
      // preferable to hares when both are in hunting range.
      const closestHunter=target=>candidates.reduce((distance,orc)=>Math.min(distance,
        Math.hypot(orc.root.position.x-target.x,orc.root.position.z-target.z)),Infinity);
      prey.sort((a,b)=>(a.kind==='corpse'?0:1)-(b.kind==='corpse'?0:1)||
        closestHunter(a)-closestHunter(b));
      for(const target of prey){
        if(jobs>=2)break;
        if(orcs.some(u=>u.orcFoodJob?.kind===target.kind&&u.orcFoodJob?.id===target.id))continue;
        if(!fogOfWar.exploredAt(target.x,target.z,'orc'))continue;
        let nearest=null,minimum=orcFoodRules.HUNT_SIGHT;
        for(const orc of candidates){
          if(orc.orcFoodJob)continue;
          const distance=Math.hypot(orc.root.position.x-target.x,orc.root.position.z-target.z);
          if(distance>=minimum)continue;
          if(!navigatorRTS.segmentClear(orc.root.position,target)&&
            !navigatorRTS.plan(orc.root.position,target))continue;
          minimum=distance;nearest=orc;
        }
        if(!nearest)continue;
        nearest.orcFoodJob={kind:target.kind,id:target.id,progress:0};
        // Autonomous scouting is resumable: the director will issue another
        // frontier waypoint after the nearby food has been consumed.
        if(nearest.scouting&&isOrcDirectorEnabled()){
          nearest.scouting=false;nearest.destination=null;
        }
        nearest.route=null;nearest.approachCache=null;jobs++;
      }
    }
    return Object.freeze({assign,reset});
  }

  return Object.freeze({create});
});
