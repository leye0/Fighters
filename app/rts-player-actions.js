// Maps screen taps and screen-space box selection to player intentions.
// The domain services make the actual mutations; this file only owns the
// priority of hit targets. Modes come from rts-player-interaction.js via the
// freshly read getState adapter, never from local mutable flags.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersPlayerActions=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function create({getState,worldPoint,issueRavenMove,setRally,scheduleBuild,
    showBanner,liveBuildings,insideFootprint,issueStoneCircleMove,
    pickRaven,selectRaven,pickUnit,pickBuilding,pickTree,pickLogBundle,
    targetFaction,orderRepair,orderMine,orderHarvest,orderAttack,
    orderChop,orderCollectWood,selectUnits,selectBuilding,issueMove,
    clearSelection,getUnits,screenPoint,getViewportWidth}){

    function tap(x,y,append=false){
      const state=getState();
      if(!state.running||state.paused||!state.overlayHidden)return;
      const pos=worldPoint(x,y);
      if(!pos)return;
      if(state.ravenMoveMode){issueRavenMove(pos);return;}
      if(state.rallyMode){if(!setRally(state.selectedBuilding,pos))
        showBanner('EMPLACEMENT INVALIDE');return;}
      if(state.buildMode){if(!scheduleBuild(state.buildMode,pos.x,pos.z))
        showBanner('EMPLACEMENT INVALIDE / OUVRIER INDISPONIBLE');return;}

      // Sanctuary commands outrank the characters crossing its ring.
      if(!state.attackMode&&state.activeFaction==='witch'&&state.selected.size){
        const sanctuary=liveBuildings().find(building=>
          building.type==='stone-circle'&&building.clanId==='witch'&&
          !building.destroyed&&insideFootprint(pos,building.hitbox));
        if(sanctuary&&issueStoneCircleMove(sanctuary))return;
      }
      const raven=pickRaven(x,y);
      if(raven){selectRaven(raven);return;}
      const friend=pickUnit(x,y,false),building=pickBuilding(pos);
      const unit=pickUnit(x,y,true);
      const treeIndex=state.selected.size?pickTree(x,y):null;
      const logIndex=state.selected.size?pickLogBundle(x,y):null;
      const faction=state.activeFaction==='witch'?'witch':'orcs';
      // A selected unit's order on a hostile building takes precedence over
      // selecting a friendly silhouette that overlaps the building footprint.
      if(state.selected.size){
        if(building&&orderRepair([...state.selected],building))return;
        if(building?.type==='mine'&&orderMine([...state.selected],building))return;
        if(building?.type==='garden'&&orderHarvest([...state.selected],building))return;
        if(building&&targetFaction(building)!==faction&&
          targetFaction(building)!=='neutral'&&orderAttack([...state.selected],building))return;
        if(unit&&targetFaction(unit)!==faction){orderAttack([...state.selected],unit);return;}
        if(treeIndex!==null&&orderChop([...state.selected],treeIndex))return;
        if(logIndex!==null&&orderCollectWood([...state.selected],logIndex))return;
      }
      if(state.attackMode){showBanner('CIBLE ENNEMIE REQUISE');return;}
      if(friend){selectUnits([friend],append);return;}
      if(building){selectBuilding(building);return;}
      if(state.selectedRaven){issueRavenMove(pos);return;}
      if(state.selected.size){issueMove(pos);return;}
      clearSelection();
    }

    function box(a,b,append=false){
      const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x);
      const top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
      // Visible character silhouettes, not just the root pixel.
      const radius=getViewportWidth()<760?11:7;
      const faction=getState().activeFaction;
      const actors=getUnits().filter(unit=>!unit.dead&&unit.kind===faction).filter(unit=>{
        const point=screenPoint(unit);
        return point.x+radius>=left&&point.x-radius<=right&&
          point.y+radius>=top&&point.y-radius<=bottom;
      });
      selectUnits(actors,append);
    }
    return Object.freeze({tap,box});
  }
  return Object.freeze({create});
});
