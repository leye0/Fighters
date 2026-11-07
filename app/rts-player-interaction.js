// Player command modes and non-unit selection state. The RTS world owns the
// selected unit Set; this controller owns the accompanying HUD/input intent.
// All changes go through named transitions so touch, keyboard and HUD share
// exactly the same state machine without a DOM or Three.js dependency.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersPlayerInteraction=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create(){
    let buildMode=null,attackMode=false,rallyMode=false,ravenMoveMode=false;
    let constructionTab=false,selectedBuilding=null,selectedRaven=null;

    function clearSelection(){
      // Historical behavior: clicking empty ground clears these three fields,
      // but deliberately does not cancel construction, attack or rally orders.
      ravenMoveMode=false;
      selectedRaven=null;
      constructionTab=false;
      selectedBuilding=null;
    }
    function selectRaven(raven){
      clearSelection();
      selectedRaven=raven;
    }
    function selectBuilding(building){
      clearSelection();
      selectedBuilding=building;
      buildMode=null;
      rallyMode=false;
      constructionTab=false;
      attackMode=false;
    }
    function forgetBuilding(building){
      if(selectedBuilding!==building)return false;
      selectedBuilding=null;
      return true;
    }
    function beginRally(){
      if(!selectedBuilding)return false;
      rallyMode=true;
      buildMode=null;
      constructionTab=false;
      return true;
    }
    function beginBuild(type){
      buildMode=type;
      rallyMode=false;
      constructionTab=false;
    }
    function completeBuild(){buildMode=null;}
    function completeRally(){rallyMode=false;}
    function beginAttack(){attackMode=true;}
    function completeAttack(){attackMode=false;}
    function beginRavenMove(){ravenMoveMode=true;}
    function completeRavenMove(){ravenMoveMode=false;}
    function openConstruction(tab){
      if(tab!=='basic'&&tab!=='advanced')throw Error('Invalid construction tab');
      constructionTab=tab;
    }
    function closeConstruction(){constructionTab=false;}
    function cancelTransient(){
      attackMode=false;
      ravenMoveMode=false;
      buildMode=null;
      rallyMode=false;
      constructionTab=false;
    }
    function reset(){
      cancelTransient();
      selectedBuilding=null;
      selectedRaven=null;
    }

    return Object.freeze({
      get buildMode(){return buildMode;},
      get attackMode(){return attackMode;},
      get rallyMode(){return rallyMode;},
      get ravenMoveMode(){return ravenMoveMode;},
      get constructionTab(){return constructionTab;},
      get selectedBuilding(){return selectedBuilding;},
      get selectedRaven(){return selectedRaven;},
      clearSelection,selectRaven,selectBuilding,forgetBuilding,
      beginRally,beginBuild,completeBuild,completeRally,
      beginAttack,completeAttack,beginRavenMove,completeRavenMove,
      openConstruction,closeConstruction,cancelTransient,reset
    });
  }

  return Object.freeze({create});
});
