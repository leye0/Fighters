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
    return Object.freeze({
      units:[],
      selected:new Set(),
      buildingInstances:new Map(),
      pendingBuilds:[],
      knownEnemyBuildings:{witch:new Set(),orc:new Set()}
    });
  }
  return Object.freeze({create});
});
