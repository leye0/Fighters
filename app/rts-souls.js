/* Fighters RTS — corpses, magical progression and soul harvesting rules. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSouls=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const CORPSE_SECONDS=120,MAX_CORPSES=40,SOUL_SIGHT=8,
    SOUL_APPROACH=.9,SOUL_SECONDS=1.35,SOUL_VALUE=20,MAX_MAGIC=100;
  const PASSIVE_MAGIC_PER_30_SECONDS=5;
  const canBuildCircle=buildings=>buildings.some(b=>
    b.type==='witch-house'&&b.clanId==='witch'&&!b.destroyed&&b.level>=2);
  const canTrainMage=buildings=>buildings.some(b=>
    b.type==='stone-circle'&&b.clanId==='witch'&&!b.destroyed);
  const magicAfterSoul=magic=>Math.min(MAX_MAGIC,Math.max(0,magic)+SOUL_VALUE);
  function magicAfterTime(magic,seconds){
    if(!Number.isFinite(magic)||!Number.isFinite(seconds)||seconds<0)
      throw Error('Invalid magic regeneration time');
    return Math.min(MAX_MAGIC,Math.max(0,magic)+PASSIVE_MAGIC_PER_30_SECONDS*seconds/30);
  }
  function nearestSoul(mage,corpses,available=()=>true){
    let nearest=null,minimum=SOUL_SIGHT;
    for(const corpse of corpses){
      if(!corpse.dead||corpse.soulClaimed||corpse.soulReservedBy||
        corpse.deadTime<=SOUL_SECONDS||!available(corpse))continue;
      const distance=Math.hypot(mage.x-corpse.x,mage.z-corpse.z);
      if(distance<minimum){minimum=distance;nearest=corpse;}
    }
    return nearest;
  }
  return {CORPSE_SECONDS,MAX_CORPSES,SOUL_SIGHT,SOUL_APPROACH,SOUL_SECONDS,
    SOUL_VALUE,MAX_MAGIC,PASSIVE_MAGIC_PER_30_SECONDS,canBuildCircle,canTrainMage,
    magicAfterSoul,magicAfterTime,nearestSoul};
});
