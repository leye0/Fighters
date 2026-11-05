/* Persistent offensive building orders and short-range self-defense.
 * The game supplies only buildings discovered by each unit's own clan.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersRaiding=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const RETALIATION_LEASH=16;
 function begin(actor){
  actor.raiding=true;
  actor.retaliationTarget=null;actor.retaliationOrigin=null;
 }
 function end(actor){
  actor.raiding=false;
  actor.retaliationTarget=null;actor.retaliationOrigin=null;
 }
 function nextBuilding(actor,buildings,discovered,isEnemy,distance){
  let choice=null,best=Infinity;
  for(const building of buildings){
   if(!discovered.has(building.id)||!isEnemy(actor,building)||
     (actor.unreachableTime>0&&actor.unreachableTarget===building))continue;
   const d=distance(actor,building);
   if(d<best){choice=building;best=d;}
  }
  return choice;
 }
 function attacked(actor,attacker,isEnemy){
  if(!actor.raiding||!isEnemy(actor,attacker))return false;
  actor.retaliationTarget=attacker;
  actor.retaliationOrigin={x:actor.root.position.x,z:actor.root.position.z};
  return true;
 }
 function retaliation(actor,isEnemy){
  const target=actor.retaliationTarget,origin=actor.retaliationOrigin;
  if(target&&origin&&isEnemy(actor,target)&&
    Math.hypot(target.root.position.x-origin.x,target.root.position.z-origin.z)<=
      RETALIATION_LEASH)return target;
  actor.retaliationTarget=null;actor.retaliationOrigin=null;
  return null;
 }
 return {begin,end,nextBuilding,attacked,retaliation,RETALIATION_LEASH};
});
