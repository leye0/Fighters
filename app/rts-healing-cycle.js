/* Fighters RTS — autonomous Witch stone-circle healing and retreat.
 * Owns its assignment cadence only; the living unit/building collections,
 * magic budget, animation and navigation are explicitly injected.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersHealingCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({units,buildingInstances,stoneHealing,getWitchMagic,
    setWitchMagic,nearestHostile,navigatorRTS,cancelSoulJob,
    animation,navigateActor}){
    let assignmentElapsed=0;
    function reset(){assignmentElapsed=0;}

    function step(dt){
      const circles=[...buildingInstances.values()].filter(b=>
        b.type==='stone-circle'&&!b.destroyed);
      const resting=[];
      for(const witch of units){
        if(witch.kind!=='witch'||witch.dead)continue;
        witch.healRetry=Math.max(0,witch.healRetry-dt);
        if(witch.health>=witch.maxHealth)continue;
        const point={x:witch.root.position.x,z:witch.root.position.z};
        if(circles.some(b=>stoneHealing.inside(point,b.root.position)))
          resting.push(witch);
      }
      // Share a single real magic budget fairly across all resting witches.
      if(resting.length)setWitchMagic(stoneHealing.restoreGroup(resting,dt,
        getWitchMagic()).magic);
      assignmentElapsed+=dt;
      if(assignmentElapsed<.85)return;
      assignmentElapsed=0;
      for(const witch of units){
        if(witch.kind!=='witch'||witch.dead)continue;
        if(witch.healJob){
          const circle=buildingInstances.get(witch.healJob.id);
          if(!circle||circle.destroyed||stoneHealing.recovered(witch)||
            nearestHostile(witch,stoneHealing.HOSTILE_SAFETY_DISTANCE)?.target)
            witch.healJob=null;
          continue;
        }
        // No autonomous retreat can override the player's commands or work.
        if(!stoneHealing.needsRest(witch)||witch.healRetry>0||witch.destination||
          witch.attack||witch.attackOrder||witch.constructJob||witch.farmJob||
          witch.repairJob||witch.mineJob||witch.treeJob||witch.woodJob||
          nearestHostile(witch,stoneHealing.HOSTILE_SAFETY_DISTANCE)?.target)continue;
        const from=witch.root.position;
        const choice=stoneHealing.nearestCircle(from,circles.map(b=>({
          id:b.id,x:b.root.position.x,z:b.root.position.z
        })),b=>{
          const goal={x:b.x,z:b.z};
          return navigatorRTS.segmentClear(from,goal)||!!navigatorRTS.plan(from,goal);
        });
        if(!choice)continue;
        cancelSoulJob(witch);
        witch.berryJob=null;witch.healJob={id:choice.id};
        witch.route=null;witch.approachCache=null;
      }
    }

    function tickRetreat(actor,dt){
      if(!actor.healJob)return false;
      if(actor.destination||actor.attackOrder||actor.constructJob||actor.farmJob||
        actor.repairJob||actor.mineJob||actor.treeJob||actor.woodJob){
        actor.healJob=null;return false;
      }
      const circle=buildingInstances.get(actor.healJob.id);
      if(!circle||circle.destroyed||stoneHealing.recovered(actor)){
        actor.healJob=null;return false;
      }
      const center=circle.root.position;
      if(Math.hypot(actor.root.position.x-center.x,actor.root.position.z-center.z)<.85){
        animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');return true;
      }
      const result=navigateActor(actor,center,dt,'order');
      if(result==='blocked'){
        actor.healJob=null;actor.healRetry=6;return false;
      }
      if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
      return true;
    }
    return Object.freeze({step,tickRetreat,reset});
  }

  return Object.freeze({create});
});
