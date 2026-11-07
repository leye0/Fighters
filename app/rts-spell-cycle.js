/* Deterministic spell decisions. The composition root owns GPU meshes, audio,
 * the actual damage/death effects and current match resources. No Three.js.
 */
(function(root,factory){
  const api=factory(
    root.FightersWitchDome||
      (typeof module==='object'&&module.exports?require('./rts-witch-dome'):null),
    root.FightersFireRain||
      (typeof module==='object'&&module.exports?require('./rts-fire-rain'):null),
    root.FightersSpellDefense||
      (typeof module==='object'&&module.exports?require('./rts-spell-defense'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSpellCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(domeRules,fireRules,defense){
  'use strict';
  const DEFENSE_INTERVAL=1.5;

  function advanceDome(effect,dt){
    effect.elapsed+=dt;
    effect.radius=domeRules.radiusAt(effect.elapsed);
    return effect.elapsed>=domeRules.DURATION;
  }
  function applyDomeDamage(effect,units,kill){
    for(const actor of units){
      if(actor.dead||actor.kind!=='orc'||
        !domeRules.inRange(effect,actor.root.position,effect.radius))continue;
      kill(actor);
    }
  }
  function advanceFireRain(effect,dt){
    effect.elapsed+=dt;
    effect.radius=fireRules.impactRadiusAt(effect.elapsed);
    return effect.elapsed>=fireRules.DURATION;
  }
  function applyFireRainDamage(effect,units,kill){
    if(effect.elapsed<fireRules.START_DAMAGE||effect.elapsed>fireRules.END_DAMAGE)return;
    for(const actor of units){
      if(actor.dead||actor.kind!=='witch'||
        !fireRules.inRange(effect,actor.root.position,effect.radius))continue;
      kill(actor);
    }
  }

  function createDefense({state,getBuildings,getWitchHouse,getUnits,getMagic,
    witchEnabled,orcEnabled,domeActive,fireActive,visible,castWitch,castOrc}){
    // Only a single temporary centre is needed per decision pass, every 1.5 s.
    // Neither this object nor the injected references are recreated per tick.
    const center={x:0,z:0};
    function threatened(home,faction){
      center.x=(home.hitbox.minX+home.hitbox.maxX)/2;
      center.z=(home.hitbox.minZ+home.hitbox.maxZ)/2;
      return defense.assess({faction,center,units:getUnits(),radius:domeRules.RADIUS,
        visible}).threatened;
    }
    function step(dt){
      state.spellDecisionElapsed+=dt;
      if(state.spellDecisionElapsed<DEFENSE_INTERVAL)return;
      state.spellDecisionElapsed=0;

      // Orc huts are evaluated first, in map insertion order. Successful
      // fire rain stops the pass; an unsuccessful cast tries the next hut.
      for(const home of getBuildings()){
        if(home.destroyed||home.type!=='hut'||home.level<3||
          !orcEnabled()||getMagic().orc<fireRules.COST)continue;
        if(!threatened(home,'orc'))continue;
        if(!fireRules.canCast(home,getMagic().orc,{faction:'orc',
          running:state.running,paused:state.paused,active:fireActive()}))continue;
        if(castOrc(home))return;
      }
      // The witch headquarters is considered last, just as it was appended
      // after the huts in game.js. Its own canCast guard precedes the cast.
      const home=getWitchHouse();
      if(!home||home.destroyed||home.level<3||!witchEnabled()||
        getMagic().witch<domeRules.COST||!threatened(home,'witch')||
        !domeRules.canCast(home,getMagic().witch,{faction:'witch',
          running:state.running,paused:state.paused,active:domeActive()}))return;
      castWitch(home);
    }
    return Object.freeze({step});
  }

  return Object.freeze({DEFENSE_INTERVAL,advanceDome,applyDomeDamage,
    advanceFireRain,applyFireRainDamage,createDefense});
});
