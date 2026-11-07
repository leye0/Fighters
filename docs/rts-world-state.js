/* Fighters RTS — owner for the mutable entity collections of one battlefield.
 * The renderer owns disposal/Three.js objects; the world owner owns their
 * registries. All references are stable across match resets, like the original
 * arrays, maps and sets in game.js. Create a fresh owner only on boot.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersWorldState=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function create(){
    const units=[],selected=new Set(),buildingInstances=new Map(),pendingBuilds=[];
    const knownEnemyBuildings={witch:new Set(),orc:new Set()};
    // Call these AFTER the composition root has removed the corresponding
    // meshes/effects. Stable identities are essential for services injected
    // once at boot, including queues, workers and minimap/fog observations.
    function resetActors(){units.length=0;selected.clear();}
    function resetConstruction(){pendingBuilds.length=0;}
    function removeConstructedBuildings(dispose){
      for(const [id,building] of buildingInstances){
        if(building.initial)continue;
        // The old map entry must still exist while its 3D object is disposed.
        dispose(building);
        buildingInstances.delete(id);
      }
    }
    function resetVisibility(){
      knownEnemyBuildings.witch.clear();
      knownEnemyBuildings.orc.clear();
    }
    return Object.freeze({units,selected,buildingInstances,pendingBuilds,
      knownEnemyBuildings,resetActors,resetConstruction,
      removeConstructedBuildings,resetVisibility});
  }
  return Object.freeze({create});
});
