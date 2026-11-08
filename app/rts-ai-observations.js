/* Fighters RTS — detached observation records passed to faction directors.
 * Browser fog, mutable entities and resource counters are given by the caller.
 * Directors see only the snapshot, never the complete mutable game state.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersAiObservations=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function orc({running,paused,gold,wood,buildingInstances,pendingBuilds=[],aliveOrcs,units,
    fogOfWar,enemyBaseKnown,scoutTarget,unitCap,populationCommitted,
    cauldronAvailable}){
    return {
      ready:true,running,paused,gold,wood,
      pendingBuilds:pendingBuilds.filter(job=>['hut','barrack','cauldron','factory','wall']
        .includes(job.type)).map(job=>({type:job.type})),
      buildings:[...buildingInstances.values()].filter(b=>!b.destroyed&&b.clanId==='orcs').map(b=>({
        id:b.id,type:b.type,level:b.level,queue:b.queue.map(j=>({kind:j.kind})),
        health:b.health,maxHealth:b.maxHealth,hitbox:b.hitbox,destroyed:b.destroyed,
        x:b.root.position.x,z:b.root.position.z,axis:b.wallAxis
      })),
      orcs:aliveOrcs.map(u=>({id:u.id,x:u.root.position.x,z:u.root.position.z,
        health:u.health,maxHealth:u.maxHealth,dead:u.dead,
        role:u.role,attackOrder:!!u.attackOrder||!!u.raiding,mining:!!u.mineJob,
        scouting:!!u.scouting,destination:!!u.destination,foraging:!!u.orcFoodJob})),
      // Keep the historical explored-area rule: only previously discovered
      // Witches are visible to this director, never the whole world.
      witches:units.filter(u=>u.kind==='witch'&&!u.dead&&
        fogOfWar.exploredAt(u.root.position.x,u.root.position.z,'orc')).map(u=>({
        id:u.id,x:u.root.position.x,z:u.root.position.z,role:u.role,dead:u.dead
      })),
      enemyBaseKnown,scoutTarget,unitCap:unitCap(),
      populationCommitted:populationCommitted(),cauldronAvailable:cauldronAvailable()
    };
  }

  function witch({running,paused,gold,wood,food,homeId,circleUnlocked,
    arcanistUnlocked,pendingBuilds,buildFaction,buildings,aliveWitches,units,
    fogOfWar,enemyTarget,scoutTarget}){
    return {
      ready:true,running,paused,gold,wood,
      food,homeId,circleUnlocked:circleUnlocked(),arcanistUnlocked:arcanistUnlocked(),
      pendingBuilds:pendingBuilds.filter(job=>buildFaction(job.type)==='witch')
        .map(job=>({type:job.type})),
      buildings:buildings.map(b=>({id:b.id,type:b.type,level:b.level,
        queue:b.queue.map(j=>({kind:j.kind})),health:b.health,
        maxHealth:b.maxHealth,hitbox:b.hitbox,destroyed:b.destroyed})),
      witches:aliveWitches.map(u=>({id:u.id,x:u.root.position.x,z:u.root.position.z,
        role:u.role,health:u.health,maxHealth:u.maxHealth,scouting:!!u.scouting,
        attackOrder:!!u.attackOrder||!!u.raiding,destination:!!u.destination,
        mining:!!u.mineJob,repairing:!!u.repairJob,healing:!!u.healJob})),
      // Witch strategy only gets orcs currently in sight, not explored-only.
      orcs:units.filter(u=>u.kind==='orc'&&!u.dead&&
        fogOfWar.visibleAt(u.root.position.x,u.root.position.z,'witch'))
        .map(u=>({id:u.id,x:u.root.position.x,z:u.root.position.z,role:u.role})),
      enemyTarget:enemyTarget?{id:enemyTarget.id}:null,scoutTarget,unitCap:17
    };
  }

  return Object.freeze({orc,witch});
});
