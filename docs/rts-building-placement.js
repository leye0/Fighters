/* Fighters RTS — construction permissions and footprint policy.
 * No scene, DOM or Three.js dependencies. Queries are live so forest, buildings,
 * treasury and workers always reflect the current match after a reset.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersBuildingPlacement=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const WITCH_BUILD_COST=230,GARDEN_BUILD_COST=175,STONE_BUILD_COST=260;
  const BUILD_WOOD_COST=Object.freeze({'witch-house':75,garden:0,'stone-circle':85,
    hut:55,barrack:95,cauldron:80,factory:130,wall:10});

  function create({orcCosts,getGold,getWood,units,isWorker,arena,clearance,
    unitRadius,navigatorRTS,Navigator,footprints,walls,
    getForestObstacles,getBushes,liveBuildings,pendingBuilds,
    wallNeighbours,wallPlacement,buildShape,circleUnlocked}){
    function constructionCost(type){
      return type==='witch-house'?WITCH_BUILD_COST:type==='garden'?GARDEN_BUILD_COST:
        type==='stone-circle'?STONE_BUILD_COST:orcCosts[type]||null;
    }
    function constructionWood(type){return BUILD_WOOD_COST[type]??0;}
    function canAffordConstruction(clan,type){
      return getGold()[clan]>=constructionCost(type)&&
        getWood()[clan]>=constructionWood(type);
    }
    function buildFaction(type){
      return ['witch-house','garden','stone-circle'].includes(type)?'witch':'orc';
    }
    function builderAvailable(clan){
      return units.some(u=>u.kind===clan&&isWorker(u)&&!u.dead);
    }
    function wallKeepsVillageExit(proposed){
      // An existing usable westbound exit may never be sealed by a new wall.
      const inside=units.filter(u=>u.kind==='orc'&&!u.dead&&
        Math.hypot(u.root.position.x-19,u.root.position.z-18)<10&&
        navigatorRTS.pointClear(u.root.position)).sort((a,b)=>
        Math.hypot(a.root.position.x-19,a.root.position.z-18)-
        Math.hypot(b.root.position.x-19,b.root.position.z-18))[0];
      const source=inside?{x:inside.root.position.x,z:inside.root.position.z}:
        navigatorRTS.findSafeGoal({x:19,z:18});
      if(!source)return true;
      const exits=[{x:3,z:18},{x:6,z:10},{x:5,z:26}].filter(p=>
        navigatorRTS.pointClear(p)&&!!navigatorRTS.plan(source,p));
      if(!exits.length)return true;
      const check=new Navigator({
        halfSize:arena.worldHalf,cellSize:1,radius:unitRadius,region:arena});
      check.setObstacles([...navigatorRTS.obstacles,proposed]);
      return check.pointClear(source)&&exits.some(p=>check.pointClear(p)&&!!check.plan(source,p));
    }
    function validBuildPosition(x,z,type='hut',axis){
      if(!constructionCost(type))return false;
      if(type==='stone-circle'&&!circleUnlocked())return false;
      if(type==='wall'&&!axis){
        const point=wallPlacement(x,z);x=point.x;z=point.z;axis=point.axis;
      }
      const proposed=buildShape(type,x,z,axis);
      if(!proposed)return false;
      const clan=buildFaction(type),geometry=footprints;
      const minX=clan==='witch'?-arena.worldHalf:0,
        maxX=clan==='witch'?0:arena.worldHalf;
      // Ownership and all actual polygon vertices must remain in the arena.
      if(proposed.minX<minX+clearance||proposed.maxX>maxX-clearance||
        proposed.polygons.some(poly=>poly.some(ring=>ring.some(([px,pz])=>
          !arena.contains(px,pz,clearance)))))return false;
      if(getForestObstacles().some(tree=>geometry.withinClearance(proposed,tree,clearance))||
         getBushes().some(b=>geometry.distanceTo({x:b.x,z:b.z},proposed)<1.65)||
         liveBuildings().some(b=>b.type!=='wall'&&geometry.withinClearance(proposed,b.hitbox,clearance))||
         pendingBuilds.some(job=>job.type!=='wall'&&geometry.withinClearance(proposed,job.site.hitbox,clearance)))return false;
      const existingWalls=wallNeighbours(),candidate={x,z,axis:axis||wallPlacement(x,z).axis};
      const pendingWalls=pendingBuilds.filter(j=>j.type==='wall').map(j=>({
        x:j.x,z:j.z,axis:j.axis,hitbox:j.site.hitbox}));
      if(type==='wall'){
        if([...existingWalls,...pendingWalls].some(w=>!walls.compatible(candidate,w)))return false;
        if(![...existingWalls,...pendingWalls].some(w=>geometry.withinClearance(proposed,w.hitbox,
          walls.MAX_LINK_GAP))&&
          !liveBuildings().some(b=>b.clanId==='orcs'&&b.type!=='mine'&&b.type!=='wall'&&
            geometry.withinClearance(proposed,b.hitbox,16)))return false;
        if(!wallKeepsVillageExit(proposed))return false;
      }else{
        if(!liveBuildings().some(b=>b.clanId===(clan==='orc'?'orcs':'witch')&&
          b.type!=='wall'&&b.type!=='mine'&&
          geometry.withinClearance(proposed,b.hitbox,8)))return false;
        if([...existingWalls,...pendingWalls].some(w=>geometry.withinClearance(proposed,w.hitbox,clearance)))return false;
      }
      // Gardens and stone circles can be worked from inside their footprint.
      return type==='garden'||type==='stone-circle'||units.every(actor=>actor.dead||
        !geometry.pointBlocked(actor.root.position,proposed,unitRadius));
    }
    return Object.freeze({constructionCost,constructionWood,
      canAffordConstruction,buildFaction,builderAvailable,
      wallKeepsVillageExit,validBuildPosition});
  }
  return Object.freeze({WITCH_BUILD_COST,GARDEN_BUILD_COST,STONE_BUILD_COST,
    BUILD_WOOD_COST,create});
});
