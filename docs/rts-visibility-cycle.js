/* Gameplay exploration, enemy-building memory and visibility policy.
 * The fog grid owns its compact cells; WebGL/DOM and scene visibility are
 * applied through injected adapters without importing a rendering engine.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersVisibilityCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({fogOfWar,knownEnemyBuildings,units,liveBuildings,
    getFaction,getSelectedBuilding,getPendingBuilds,buildFaction,
    ravenReady,ravenSightSources,setActorVisible,setBuildingVisible,
    setBuildingHealthBarVisible,setPreviewVisible,uploadFogTexture}){

    function buildingInDiscoveredZone(building,clan){
      const h=building.hitbox;
      if(!h)return false;
      const midX=(h.minX+h.maxX)/2,midZ=(h.minZ+h.maxZ)/2;
      // Nine fixed tests cover large buildings whose exposed corners are
      // seen before their centres. Preserve short-circuit order and avoid
      // creating temporary sample arrays for each visibility query.
      return fogOfWar.exploredAt(midX,midZ,clan)||
        fogOfWar.exploredAt(h.minX,midZ,clan)||
        fogOfWar.exploredAt(h.maxX,midZ,clan)||
        fogOfWar.exploredAt(midX,h.minZ,clan)||
        fogOfWar.exploredAt(midX,h.maxZ,clan)||
        fogOfWar.exploredAt(h.minX,h.minZ,clan)||
        fogOfWar.exploredAt(h.minX,h.maxZ,clan)||
        fogOfWar.exploredAt(h.maxX,h.minZ,clan)||
        fogOfWar.exploredAt(h.maxX,h.maxZ,clan);
    }

    function groundSightSources(clan,structures=liveBuildings()){
      const ownership=clan==='witch'?'witch':'orcs';
      const sources=units.filter(actor=>actor.kind===clan&&!actor.dead)
        .map(actor=>({x:actor.root.position.x,z:actor.root.position.z}));
      // Natural deposits and walls are never allied watchtowers.
      for(const b of structures){
        if(b.clanId!==ownership||b.type==='mine'||b.type==='wall'||!b.hitbox)continue;
        sources.push({x:(b.hitbox.minX+b.hitbox.maxX)/2,
          z:(b.hitbox.minZ+b.hitbox.maxZ)/2});
      }
      return sources;
    }

    function updateVision(){
      const structures=liveBuildings();
      for(const [clan,ownership] of [['witch','witch'],['orc','orcs']]){
        const sources=groundSightSources(clan,structures);
        if(clan==='witch'&&ravenReady())sources.push(...ravenSightSources());
        fogOfWar.update(clan,sources);
        for(const b of structures){
          if(b.clanId!==ownership&&b.clanId!=='neutral'&&
            buildingInDiscoveredZone(b,clan))knownEnemyBuildings[clan].add(b.id);
        }
      }

      // Exploration belongs to the viewed faction, never to the opponent's
      // own map. Discovery persists after scouts leave the area.
      const faction=getFaction(),ownership=faction==='witch'?'witch':'orcs';
      for(const actor of units){
        setActorVisible(actor,actor.kind===faction||
          fogOfWar.exploredAt(actor.root.position.x,actor.root.position.z,faction));
      }
      for(const b of structures){
        const friendly=b.clanId===ownership;
        const discovered=buildingInDiscoveredZone(b,faction);
        setBuildingVisible(b,friendly||discovered);
        if(b.healthBar)setBuildingHealthBarVisible(b,(friendly||discovered)&&
          (b.health<b.maxHealth||getSelectedBuilding()===b));
      }
      for(const job of getPendingBuilds())if(job.preview){
        const owner=buildFaction(job.type);
        setPreviewVisible(job,owner===faction||
          fogOfWar.exploredAt(job.x,job.z,faction));
      }
      uploadFogTexture(faction);
    }

    function visibleToPlayer(x,z){
      return fogOfWar.exploredAt(x,z,getFaction());
    }

    return Object.freeze({buildingInDiscoveredZone,groundSightSources,
      updateVision,visibleToPlayer});
  }

  return Object.freeze({create});
});
