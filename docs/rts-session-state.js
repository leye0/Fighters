/* Mutable scalars of a Fighters match. No DOM, Three.js or module-global state.
 * The stable `state` identity lets long-lived services read the current match.
 * Named reset boundaries retain the original game.js cleanup order.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSessionState=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const INITIAL=Object.freeze({
    running:false,paused:false,activeFaction:'witch',chosenFaction:'witch',
    nextUnitId:1,orcSpawned:false,qaPassiveKind:null,
    farmSerial:0,stoneCircleSerial:0,wallSerial:0,
    orcIncomeFraction:0,strategyAccumulator:0,witchStrategyAccumulator:0,
    completedMiningCycles:0,totalMinedGold:0,
    spellDecisionElapsed:0,fogElapsed:0,fogStarted:false,
    lastOrcAiVoice:-Infinity
  });

  function create(){
    const state={...INITIAL};
    const reset=()=>Object.assign(state,INITIAL);
    function resetAudio(){state.lastOrcAiVoice=-Infinity;}
    function resetSpells(){state.spellDecisionElapsed=0;}
    function resetActors(){state.nextUnitId=1;}
    function resetFarming(){state.farmSerial=0;}
    function resetConstruction(){state.stoneCircleSerial=0;state.wallSerial=0;}
    function resetVisibility(){state.fogElapsed=0;state.fogStarted=true;}
    function resetStrategy(){
      state.orcIncomeFraction=0;state.strategyAccumulator=0;
      state.witchStrategyAccumulator=0;
    }
    function resetOrcSpawn(){state.orcSpawned=false;}
    function resetPassive(){state.qaPassiveKind=null;}
    function resetMining(){state.completedMiningCycles=0;state.totalMinedGold=0;}
    function beginMatch(){
      state.activeFaction=state.chosenFaction;state.paused=false;state.running=true;
    }
    return Object.freeze({state,reset,resetAudio,resetSpells,resetActors,
      resetFarming,resetConstruction,resetVisibility,resetStrategy,
      resetOrcSpawn,resetPassive,resetMining,beginMatch});
  }
  return Object.freeze({create});
});
