/* Stable owner for mutable match resources; no DOM or rendering dependency. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersMatchState=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function create({gold:initialGold,wood:initialWood}){
    let gold={...initialGold},wood={...initialWood};
    function reset(){
      // Rebind rather than mutate; each game gets a fresh resource economy.
      gold={...initialGold};wood={...initialWood};
    }
    return Object.freeze({get gold(){return gold;},get wood(){return wood;},reset});
  }
  return Object.freeze({create});
});
