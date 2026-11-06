/* Common, sight-limited power estimate for autonomous settlement superweapons. */
(function(root,factory){
  const api=factory(root.FightersRoles||
    (typeof module==='object'&&module.exports?require('./rts-roles'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSpellDefense=api;
})(typeof globalThis==='object'?globalThis:this,function(roles){
  'use strict';
  const THREAT_RATIO=1.3,MIN_ATTACKERS=2;
  function power(unit){
    const spec=roles.DEFINITIONS[unit.kind]?.[unit.role];
    if(!spec)return 0;
    const vitality=Math.max(0,Math.min(1,(unit.health??spec.health)/
      Math.max(1,unit.maxHealth??spec.health)));
    if(unit.role==='worker')return 1.5*vitality;
    // Weapons, effective ranged reach and survivability all matter. Unit
    // count alone is an unreliable predictor of a melee/mage confrontation.
    return spec.damage*(1+Math.min(spec.range,7)/15)*
      Math.sqrt(spec.health/85)*Math.sqrt(vitality);
  }
  function assess({faction,center,units,radius=20,visible=()=>true}){
    const defendingKind=faction==='witch'?'witch':'orc';
    let attackers=0,enemyPower=0,friendlyPower=0;
    for(const unit of units){
      if(unit.dead||!unit.root?.position)continue;
      const p=unit.root.position,distance=Math.hypot(p.x-center.x,p.z-center.z);
      const isEnemy=unit.kind!==defendingKind;
      if(isEnemy){
        if(distance>radius||!visible(p.x,p.z,faction))continue;
        if(unit.role!=='worker')attackers++;
        enemyPower+=power(unit)*(1-.25*distance/radius);
      }else if(distance<=radius+5){
        friendlyPower+=power(unit)*(1-.4*Math.max(0,distance-radius)/5);
      }
    }
    return {attackers,enemyPower,friendlyPower,
      threatened:attackers>=MIN_ATTACKERS&&enemyPower>friendlyPower*THREAT_RATIO&&
        enemyPower>=22};
  }
  return {THREAT_RATIO,MIN_ATTACKERS,power,assess};
});
