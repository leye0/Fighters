/* Fighters RTS — Orc response to harmless Witch raven decoys.
 * Vision, navigation and animation are injected; the bird is not a combat
 * entity, and this state machine can never damage or kill it.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersRavenDistraction=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({roles,ravenFlock,fogOfWar,isModelLoaded,isOrcDirectorEnabled,
    navigateActor,animation,faceDirection,random}){
    function tick(actor,dt){
      if(!isModelLoaded()||actor.kind!=='orc'||!roles.isFighter(actor)||
        !isOrcDirectorEnabled())return false;
      actor.ravenCooldown=Math.max(0,(actor.ravenCooldown||0)-dt);
      if(!actor.ravenDistraction&&actor.ravenCooldown<=0){
        const bird=ravenFlock.nearestDecoy(actor.root.position,
          Math.min(actor.profile.sight,6.7));
        // An orc must actually have sight of the bird: no omniscient chasing.
        if(bird&&fogOfWar.visibleAt(bird.x,bird.z,'orc')){
          actor.ravenDistraction={id:bird.id,remaining:4.3+random()*1.7};
          actor.ravenCooldown=11;
          actor.route=null;
        }
      }
      const distraction=actor.ravenDistraction;
      if(!distraction)return false;
      distraction.remaining-=dt;
      const bird=ravenFlock.ravens.find(raven=>raven.id===distraction.id);
      if(!bird||distraction.remaining<=0||
        Math.hypot(bird.x-actor.root.position.x,bird.z-actor.root.position.z)>11){
        actor.ravenDistraction=null;actor.route=null;return false;
      }
      const position={x:bird.x,z:bird.z};
      if(Math.hypot(position.x-actor.root.position.x,
        position.z-actor.root.position.z)>1.35){
        const result=navigateActor(actor,position,dt,'pursuit');
        if(result==='blocked'){
          actor.ravenDistraction=null;actor.ravenCooldown=11;actor.route=null;
          return false;
        }
        if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
      }else{
        faceDirection(actor,bird.x-actor.root.position.x,bird.z-actor.root.position.z);
        animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
      }
      // Following distracts Orcs, but cannot kill the Witch familiar.
      return true;
    }
    return Object.freeze({tick});
  }

  return Object.freeze({create});
});
