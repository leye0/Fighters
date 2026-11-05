/* Fighters RTS — standing-stone sanctuary rules, independent of rendering. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersHealing=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const RADIUS=1.4,HEAL_PER_SECOND=11,RETREAT_AT=.70,RECOVER_TO=.96;
  // One soul (20 magic) pays for 300 health points; passive regeneration
  // (5 magic / 30s) can sustain limited healing without harvested souls.
  const HEALTH_PER_MAGIC=15;
  const HOSTILE_SAFETY_DISTANCE=9;
  function inside(unit,circle){
    return Math.hypot(unit.x-circle.x,unit.z-circle.z)<=RADIUS;
  }
  function restore(current,maximum,dt){
    if(!Number.isFinite(dt)||dt<0)throw Error('Invalid healing time');
    return Math.min(maximum,Math.max(0,current)+HEAL_PER_SECOND*dt);
  }
  // All witches sharing a sanctuary are healed at the same proportional rate
  // when magic is scarce. Spend only on *actual* restored HP, never on a
  // full-health unit or excess time. The group is mutated in place.
  function restoreGroup(witches,dt,availableMagic){
    if(!Number.isFinite(dt)||dt<0)throw Error('Invalid healing time');
    if(!Number.isFinite(availableMagic)||availableMagic<0)
      throw Error('Invalid magic budget');
    const requests=[];
    let requested=0;
    for(const witch of witches){
      if(!Number.isFinite(witch.health)||!Number.isFinite(witch.maxHealth)||
        witch.maxHealth<=0)throw Error('Invalid healing target');
      const base=Math.min(witch.maxHealth,Math.max(0,witch.health));
      const amount=Math.max(0,restore(base,witch.maxHealth,dt)-base);
      requests.push({witch,base,amount});
      requested+=amount;
    }
    const fraction=requested>0?
      Math.min(1,availableMagic*HEALTH_PER_MAGIC/requested):0;
    let healed=0;
    for(const {witch,base,amount} of requests){
      const gained=amount*fraction;
      witch.health=base+gained;
      healed+=gained;
    }
    const spent=Math.min(availableMagic,healed/HEALTH_PER_MAGIC);
    const remaining=availableMagic-spent;
    return {magic:remaining<1e-9?0:remaining,healed,spent};
  }
  function needsRest(unit){
    return unit.maxHealth>0&&unit.health/unit.maxHealth<RETREAT_AT;
  }
  function recovered(unit){
    return unit.health>=unit.maxHealth*RECOVER_TO;
  }
  function nearestCircle(unit,circles,reachable=()=>true){
    return circles.filter(circle=>!circle.destroyed&&reachable(circle))
      .sort((a,b)=>Math.hypot(unit.x-a.x,unit.z-a.z)-
        Math.hypot(unit.x-b.x,unit.z-b.z))[0]||null;
  }
  return Object.freeze({RADIUS,HEAL_PER_SECOND,HEALTH_PER_MAGIC,RETREAT_AT,RECOVER_TO,
    HOSTILE_SAFETY_DISTANCE,inside,restore,restoreGroup,needsRest,recovered,nearestCircle});
});
