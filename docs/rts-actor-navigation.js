/* Actor navigation policy: goal selection around precise building footprints,
 * route caching, waypoint pruning and recovery from blocked movement. The
 * composition root injects actual physics, facing and animation. No Three.js.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersActorNavigation=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({navigatorRTS,units,unitRadius,buildingPerimeterSites,
    closestBoundary,watchMovement,stepPhysics,faceDirection,animation}){
    function approachBuilding(actor,building){
      const b=building.hitbox,p=actor.root.position,pad=unitRadius+.14;
      const cache=actor.approachCache;
      // Cache failed searches too: an unreachable HQ must not run A* on each
      // tick. A cached candidate is rechecked after navigation invalidation.
      if(cache?.id===building.id&&cache.version===navigatorRTS.version&&
        actor.approachAge<(cache.point?2.5:.75)&&
        (!cache.point||navigatorRTS.pointClear(cache.point)))
        return cache.point;
      const from={x:p.x,z:p.z};
      // The shared perimeter list is immutable to this policy: a siege must
      // not grow it with every actor or sort it in coworker-dependent order.
      const candidates=[...buildingPerimeterSites(building,pad)];
      const closest=closestBoundary(from,b);
      if(closest.closest){
        const q=closest.closest,dx=p.x-q.x,dz=p.z-q.z;
        const length=Math.hypot(dx,dz);
        if(length>.01){
          const point={x:q.x+pad*dx/length,z:q.z+pad*dz/length};
          if(navigatorRTS.pointClear(point))candidates.unshift(point);
        }
      }
      const coworkers=units.filter(other=>other!==actor&&!other.dead&&
        (other.attackOrder===building||other.attack?.target===building||
          other.mineJob?.mineId===building.id));
      candidates.sort((a,b)=>{
        const score=goal=>{
          let cost=Math.hypot(goal.x-p.x,goal.z-p.z);
          for(const other of coworkers){
            const site=other.approachCache?.id===building.id&&other.approachCache.point?
              other.approachCache.point:other.root.position;
            const gap=Math.hypot(goal.x-site.x,goal.z-site.z);
            if(gap<1.4)cost+=(1.4-gap)*4;
          }
          return cost;
        };
        return score(a)-score(b);
      });
      for(const candidate of candidates){
        if(navigatorRTS.segmentClear(from,candidate)||
          navigatorRTS.plan(from,candidate)){
          actor.approachCache={id:building.id,point:candidate,
            version:navigatorRTS.version};
          actor.approachAge=0;return candidate;
        }
      }
      actor.approachCache={id:building.id,point:null,version:navigatorRTS.version};
      actor.approachAge=0;
      return null;
    }

    function navigateActor(actor,target,dt,mode){
      const pos=actor.root.position,from={x:pos.x,z:pos.z};
      actor.unstickSeconds=Math.max(0,actor.unstickSeconds-dt);
      const distance=Math.hypot(target.x-pos.x,target.z-pos.z);
      const arrival=mode==='engage'?.055:mode==='pursuit'?1.35:.36;
      if(distance<=arrival){actor.navWatch=null;return 'arrived';}
      const goalChanged=!actor.routeGoal||
        Math.hypot(target.x-actor.routeGoal.x,target.z-actor.routeGoal.z)>
          (mode==='pursuit'?1.1:.4);
      actor.routeAge+=dt;
      const directClear=navigatorRTS.segmentClear(from,target);
      if(directClear){
        actor.route=null;actor.routeGoal={x:target.x,z:target.z};
        actor.routeVersion=navigatorRTS.version;
      }else if(actor.routeVersion!==navigatorRTS.version||goalChanged||
        actor.routeAge>(actor.route?2.3:.75)){
        // Keep a failed route briefly instead of running A* sixty times per
        // second against a truly unreachable destination.
        actor.route=navigatorRTS.plan(from,target);
        actor.routeGoal={x:target.x,z:target.z};
        actor.routeVersion=navigatorRTS.version;actor.routeAge=0;
      }
      if(!directClear&&!actor.route){actor.navWatch=null;return 'blocked';}
      let waypoint=actor.route?.waypoints[0]||target;
      if(actor.route){
        while(actor.route.waypoints.length>1&&
          Math.hypot(waypoint.x-pos.x,waypoint.z-pos.z)<.45){
          actor.route.waypoints.shift();waypoint=actor.route.waypoints[0];
        }
        // A swept-circle collision check can skip all visibly clear nodes.
        for(let i=actor.route.waypoints.length-1;i>0;i--){
          if(navigatorRTS.segmentClear(from,actor.route.waypoints[i])){
            actor.route.waypoints.splice(0,i);
            waypoint=actor.route.waypoints[0];break;
          }
        }
      }
      const gap=Math.hypot(waypoint.x-pos.x,waypoint.z-pos.z);
      if(gap<.03){actor.navWatch=null;return 'arrived';}
      const stalls=watchMovement(actor,from,waypoint,dt);
      if(stalls){
        // Ignore soft crowd avoidance for two seconds after a stall, while
        // retaining hard building collisions in the injected physics step.
        actor.route=null;actor.routeGoal=null;actor.routeAge=0;
        actor.approachCache=null;actor.unstickSeconds=2;
        if(stalls>=3){actor.navWatch=null;return 'blocked';}
        return 'retrying';
      }
      const speed=actor.speed*dt;
      const budget=Math.max(0,Math.min(gap-(actor.route?0:arrival),speed));
      const next=stepPhysics(from,waypoint,budget,actor,units,navigatorRTS,unitRadius);
      if(!next){
        actor.route=null;actor.routeGoal=null;actor.routeAge=0;
        if(++actor.noStepFailures<3)return 'retrying';
        actor.noStepFailures=0;actor.navWatch=null;return 'blocked';
      }
      actor.noStepFailures=0;
      const step=Math.hypot(next.x-pos.x,next.z-pos.z);
      if(step<.00001)return 'retrying';
      faceDirection(actor,next.x-pos.x,next.z-pos.z);
      pos.set(next.x,0,next.z);animation(actor,'Walk_Loop');
      return 'moving';
    }

    return Object.freeze({approachBuilding,navigateActor});
  }
  return Object.freeze({create});
});
