/* Fighters RTS — nearby Witch berry-forager assignment and consumption.
 * The bush economy, navigation, threat scan, animation and HUD are injected by
 * game.js. Assignment is bounded to two simultaneous foragers every 850 ms.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersBerryForagerCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({units,wildBerries,farming,roles,nearestHostile,
    navigateActor,markWorkBlocked,animation,faceDirection,farmHarvest,
    forageSight,eatSeconds,syncBerryVisuals,refreshHUD}){
    let assignmentElapsed=0;

    function reset(){assignmentElapsed=0;}

    function assign(dt){
      assignmentElapsed+=dt;
      if(assignmentElapsed<.85)return;
      assignmentElapsed=0;
      // Nearby idle witches (of any role) may eat. They never abandon explicit
      // orders, garden work, mining, construction, tree felling or combat.
      const candidates=units.filter(u=>u.kind==='witch'&&!u.dead&&!u.attack&&
        !u.raiding&&!u.attackOrder&&!u.destination&&!u.constructJob&&!u.mineJob&&
        !u.repairJob&&!u.treeJob&&!u.woodJob&&!u.farmJob&&!u.berryJob&&!u.soulJob&&
        !u.workerRetryTime);
      let jobs=units.filter(u=>u.berryJob&&!u.dead).length;
      for(const bush of wildBerries.bushes){
        if(jobs>=2)break;
        if(bush.stage!==3||units.some(u=>u.berryJob?.index===bush.id&&!u.dead))continue;
        let closest=null,dist=forageSight;
        for(const actor of candidates){
          if(actor.berryJob)continue;
          const d=Math.hypot(actor.root.position.x-bush.x,actor.root.position.z-bush.z);
          if(d>=dist)continue;
          if(roles.isFighter(actor)&&nearestHostile(actor,actor.profile.sight)?.target)continue;
          dist=d;closest=actor;
        }
        if(!closest)continue;
        closest.berryJob={index:bush.id,progress:0};
        closest.route=null;closest.approachCache=null;jobs++;
      }
    }

    function tick(actor,dt){
      if(!actor.berryJob)return false;
      const bush=wildBerries.bushes[actor.berryJob.index];
      if(!bush||bush.stage!==3||actor.destination||actor.attackOrder||actor.woodJob||
        (roles.isFighter(actor)&&nearestHostile(actor,actor.profile.sight)?.target)){
        actor.berryJob=null;return false;
      }
      if(Math.hypot(actor.root.position.x-bush.x,actor.root.position.z-bush.z)>.67){
        const status=navigateActor(actor,bush,dt,'engage');
        if(status==='blocked'){markWorkBlocked(actor);actor.berryJob=null;}
        if(status!=='moving')animation(actor,'Idle_Loop');
        return true;
      }
      faceDirection(actor,bush.x-actor.root.position.x,bush.z-actor.root.position.z);
      animation(actor,farmHarvest);
      actor.berryJob.progress+=dt;
      if(actor.berryJob.progress>=eatSeconds){
        const amount=wildBerries.eat(bush.id);
        actor.berryJob=null;
        if(amount){farming.forage(amount);syncBerryVisuals();refreshHUD();}
        animation(actor,'Idle_Loop');
      }
      return true;
    }

    return Object.freeze({reset,assign,tick});
  }
  return Object.freeze({create});
});
