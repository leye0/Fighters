#!/usr/bin/env node
/** Policy tests on plain objects; real A* and crowd physics exercised below. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create,frontSpawnSites}=require('../app/rts-actor-navigation.js');
const {Navigator}=require('../app/rts-navigation.js');
const physics=require('../app/rts-unit-physics.js');

function actor(x=0,z=0){
  const position={x,z,y:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}};
  return {root:{position},dead:false,speed:5,route:null,routeVersion:-1,
    routeGoal:null,routeAge:0,approachCache:null,approachAge:0,
    navWatch:null,unstickSeconds:0,noStepFailures:0};
}

{
  const sites=[{x:-2,z:-1},{x:1,z:-2},{x:0,z:2},{x:2,z:1},{x:-1,z:-2}];
  const result=frontSpawnSites(sites,{minX:-1,maxX:1,minZ:-1,maxZ:1});
  assert.deepEqual(result,[sites[3],sites[2]],
    'Trained troops may only appear on the camera-facing half of a building');
  assert.equal(sites.length,5,'Spawn ranking cannot mutate the shared perimeter cache');
}
function harness({navigation,party,sites,closest,watch,step}={}){
  const events={plans:[],watch:[],steps:[],faces:[],animations:[]};
  const nav=navigation||{version:1,pointClear:()=>true,
    segmentClear:()=>true,plan(from,to){events.plans.push({...to});
      return {waypoints:[{...to}]};}};
  const units=party||[];
  const api=create({navigatorRTS:nav,units,unitRadius:.45,
    buildingPerimeterSites:sites||(()=>[]),
    closestBoundary:closest||(()=>({closest:null})),
    watchMovement:(...args)=>{events.watch.push(args);return watch?watch(...args):0;},
    stepPhysics:(...args)=>{events.steps.push(args);
      if(step)return step(...args);
      const [from,to,budget]=args,gap=Math.hypot(to.x-from.x,to.z-from.z);
      return gap&&budget?{x:from.x+(to.x-from.x)*budget/gap,
        z:from.z+(to.z-from.z)*budget/gap}:null;},
    faceDirection:(...args)=>events.faces.push(args),
    animation:(...args)=>events.animations.push(args)});
  return {api,nav,units,events};
}

// Three exact arrival radii, and no physics/animation work on arrival.
for(const [mode,radius] of [['engage',.055],['pursuit',1.35],['order',.36]]){
  const {api,events}=harness();
  const a=actor();a.unstickSeconds=.03;a.navWatch={stalls:2};
  assert.equal(api.navigateActor(a,{x:radius,z:0},.01,mode),'arrived',mode);
  assert.equal(a.navWatch,null);
  assert(Math.abs(a.unstickSeconds-.02)<1e-10);
  assert.equal(events.steps.length,0);
  assert.equal(events.animations.length,0);
  const moving=actor();
  assert.equal(api.navigateActor(moving,{x:radius+.1,z:0},.01,mode),'moving');
  assert(Math.abs(events.steps.at(-1)[2]-.05)<1e-10,
    'The original speed * dt movement budget must not change');
}
{
  const {api,events}=harness();
  const fleeing=actor();fleeing.fearTime=1;
  api.navigateActor(fleeing,{x:10,z:0},.1,'order');
  assert(Math.abs(events.steps[0][2]-.75)<1e-9,
    'A frightened worker walks 50% faster than its ordinary 5m/s pace');
}

// Failed-route caching: a first impossible goal triggers only one A* call;
// later calls stay blocked until 750 ms or a collision-grid version change.
{
  const nav={version:1,pointClear:()=>true,segmentClear:()=>false,planCount:0,
    plan(){this.planCount++;return null;}};
  const {api}=harness({navigation:nav});
  const a=actor(),goal={x:10,z:0};
  assert.equal(api.navigateActor(a,goal,.01,'order'),'blocked');
  assert.equal(nav.planCount,1);
  for(let i=0;i<37;i++)assert.equal(api.navigateActor(a,goal,.02,'order'),'blocked');
  assert.equal(nav.planCount,1,'An unreachable goal must not be replanned at 60 Hz');
  assert.equal(api.navigateActor(a,goal,.02,'order'),'blocked');
  assert.equal(nav.planCount,2,'Missing paths are retried after 750 ms');
  nav.version++;
  assert.equal(api.navigateActor(a,goal,.01,'order'),'blocked');
  assert.equal(nav.planCount,3,'Changed obstacles invalidate failed route caches');
  assert.equal(a.navWatch,null);
}

// A live A* path is refreshed after 2.3 s, a changed target, or changed grid.
{
  const nav={version:1,pointClear:()=>true,segmentClear:()=>false,plans:0,
    plan(from,to){this.plans++;return {waypoints:[{x:to.x,z:to.z}]};}};
  const {api}=harness({navigation:nav,step:()=>({x:0,z:0})});
  const a=actor(),goal={x:10,z:0};
  api.navigateActor(a,goal,.01,'order');
  assert.equal(nav.plans,1);
  a.routeAge=2.29;api.navigateActor(a,goal,.01,'order');
  assert.equal(nav.plans,1);
  api.navigateActor(a,goal,.02,'order');
  assert.equal(nav.plans,2);
  api.navigateActor(a,{x:10.39,z:0},.01,'order');
  assert.equal(nav.plans,2,'Order target drift <= .4 retains its path');
  api.navigateActor(a,{x:10.41,z:0},.01,'order');
  assert.equal(nav.plans,3);
  nav.version++;api.navigateActor(a,{x:10.41,z:0},.01,'order');
  assert.equal(nav.plans,4);
  a.routeAge=0;a.routeGoal={x:10,z:0};
  api.navigateActor(a,{x:11.09,z:0},.01,'pursuit');
  assert.equal(nav.plans,4,'Pursuit movement tolerates 1.1 m target drift');
  api.navigateActor(a,{x:11.11,z:0},.01,'pursuit');
  assert.equal(nav.plans,5);
}

// Waypoints are pruned in place. A swept-circle clear last node can be used
// immediately, and only the domain chooses a waypoint, not the physics API.
{
  const nav={version:1,pointClear:()=>true,
    segmentClear:(from,to)=>to.x===4,
    plan:()=>{throw Error('Retained route should be reused');}};
  const a=actor();a.route={waypoints:[{x:.2,z:0},{x:2,z:0},{x:4,z:0}]};
  a.routeVersion=1;a.routeGoal={x:7,z:0};
  const {api,events}=harness({navigation:nav,step:()=>({x:.05,z:0})});
  assert.equal(api.navigateActor(a,{x:7,z:0},.01,'order'),'moving');
  assert.deepEqual(a.route.waypoints,[{x:4,z:0}],
    'Direct swept-circle checks should prune obsolete intermediate points');
  assert.equal(events.steps[0][1].x,4);
  assert.equal(events.steps[0][2],.05);
  assert.deepEqual(events.animations.map(x=>x[1]),['Walk_Loop']);
  assert.equal(a.root.position.x,.05);
}

// If the current route was direct and becomes clear again, it is dropped;
// the actor stops at the exact configured distance, not at the target centre.
{
  const {api,events}=harness();
  const a=actor();a.route={waypoints:[{x:2,z:1}]};
  assert.equal(api.navigateActor(a,{x:1,z:0},.1,'order'),'moving');
  assert.equal(a.route,null);
  assert.equal(a.routeGoal.x,1);
  assert(Math.abs(events.steps[0][2]-.5)<1e-10);
  assert.equal(a.root.position.x,.5);
  assert.equal(api.navigateActor(a,{x:1,z:0},.1,'order'),'moving');
  assert(Math.abs(events.steps[1][2]-.14)<1e-10);
  assert(Math.abs(a.root.position.x-.64)<1e-10);
  assert.equal(api.navigateActor(a,{x:1,z:0},.1,'order'),'arrived');
}

// The physics watchdog can force a two-second soft-crowd bypass. A third
// consecutive stall blocks the action; these are not routing-plan failures.
for(const stalls of [1,2,3]){
  const {api,events}=harness({watch:()=>stalls});
  const a=actor();a.route={waypoints:[{x:5,z:0}]};
  a.routeGoal={x:5,z:0};a.routeAge=2;a.approachCache={id:'home'};
  assert.equal(api.navigateActor(a,{x:5,z:0},.1,'engage'),
    stalls===3?'blocked':'retrying');
  assert.equal(a.unstickSeconds,2);
  assert.equal(a.route,null);assert.equal(a.routeGoal,null);
  assert.equal(a.routeAge,0);assert.equal(a.approachCache,null);
  assert.equal(events.steps.length,0);
  if(stalls===3)assert.equal(a.navWatch,null);
}

// Three physical failures, unlike stale paths, are counted even on a direct
// segment. No animation is issued for zero displacement; success resets it.
{
  let physicalFail=true;
  const {api,events}=harness({step:()=>physicalFail?null:{x:0,z:0}});
  const a=actor();
  for(let i=1;i<=3;i++){
    assert.equal(api.navigateActor(a,{x:5,z:0},.1,'order'),
      i===3?'blocked':'retrying');
    assert.equal(a.noStepFailures,i===3?0:i);
  }
  physicalFail=false;
  assert.equal(api.navigateActor(a,{x:5,z:0},.1,'order'),'retrying');
  assert.equal(a.noStepFailures,0);
  assert.equal(events.faces.length,0);
  assert.equal(events.animations.length,0);
}

// Approaches use polygon-exterior candidates; a coworker can make a nearby
// stand-off worse than a farther unoccupied one. Never mutate shared sites.
{
  const building={id:'hut',hitbox:{minX:-1,maxX:1,minZ:-1,maxZ:1}};
  const perimeter=[{x:2,z:0},{x:0,z:2},{x:-2,z:0}];
  const a=actor(1.8,0),other=actor(2,0);other.attackOrder=building;
  const {api,nav}=harness({party:[a,other],sites:()=>perimeter});
  const chosen=api.approachBuilding(a,building);
  assert.deepEqual(chosen,{x:0,z:2},'Coworker spacing penalty must steer around crowded stand-offs');
  assert.equal(a.approachCache.point,chosen);
  assert.equal(a.approachAge,0);
  assert.deepEqual(perimeter,[{x:2,z:0},{x:0,z:2},{x:-2,z:0}],
    'No sorted copy may leak back into the shared geometry cache');
  other.attackOrder=null;a.approachAge=2.49;
  assert.equal(api.approachBuilding(a,building),chosen,
    'A valid approach point stays cached for 2.5 seconds');
  a.approachAge=2.5;
  assert.deepEqual(api.approachBuilding(a,building),{x:2,z:0});
  nav.version++;
  assert.deepEqual(api.approachBuilding(a,building),{x:2,z:0},
    'A grid version change invalidates the perimeter choice');
}

// Actual projected boundary candidate is inserted into a private copy, and
// an unreachable building is cached for 0.75 seconds before another search.
{
  const building={id:'house',hitbox:{minX:-1,maxX:1,minZ:-1,maxZ:1}};
  const perimeter=[{x:4,z:0}];
  const a=actor(2,0),nav={version:4,searches:0,clear:true,
    pointClear(){return this.clear;},segmentClear:()=>false,
    plan(){this.searches++;return null;}};
  const {api}=harness({navigation:nav,sites:()=>perimeter,
    closest:()=>({closest:{x:1,z:0}})});
  assert.equal(api.approachBuilding(a,building),null);
  assert.equal(nav.searches,2,'Projected point plus sampled perimeter are checked once');
  assert.equal(a.approachCache.point,null);
  a.approachAge=.74;assert.equal(api.approachBuilding(a,building),null);
  assert.equal(nav.searches,2);
  a.approachAge=.75;api.approachBuilding(a,building);
  assert.equal(nav.searches,4,'Failed approach is retried after .75 s');
  nav.clear=false;
  assert.deepEqual(perimeter,[{x:4,z:0}]);
  const direct=harness({sites:()=>perimeter,
    closest:()=>({closest:{x:1,z:0}})});
  assert.deepEqual(direct.api.approachBuilding(actor(2,0),building),{x:1.59,z:0},
    'The actor should be able to stand 0.59 m outside the exact contour');
}

// Full pathfinding + swept collision + crowd steering integration, without
// Three.js: independent runs must have bit-identical trajectories and never
// penetrate the obstacle while rounding its corner.
function travel(){
  const nav=new Navigator({halfSize:28,radius:physics.RADIUS,cellSize:1});
  nav.setObstacles([{id:'hut',minX:-1,maxX:1,minZ:-1,maxZ:1}]);
  const a=actor(-8,0),party=[a],angles=[];
  const api=create({navigatorRTS:nav,units:party,unitRadius:physics.RADIUS,
    buildingPerimeterSites:()=>[],closestBoundary:()=>({closest:null}),
    watchMovement:physics.watchMovement,stepPhysics:physics.step,
    faceDirection:(actor,dx,dz)=>angles.push([dx,dz]),
    animation:(actor,name)=>assert.equal(name,'Walk_Loop')});
  const path=[];let status='moving';
  for(let i=0;i<600;i++){
    status=api.navigateActor(a,{x:8,z:0},1/60,'order');
    path.push([a.root.position.x,a.root.position.z,status]);
    assert(nav.pointClear(a.root.position),'No movement may penetrate the building');
    if(status==='arrived')break;
  }
  // The historical strict <= .36 check can stop at .36000000000000026 due
  // to rounding. Keep that exact stop instead of changing gameplay in S2.
  assert(['arrived','retrying'].includes(status),
    'A* detour must actually finish or reach the historic floating-point stop');
  assert(Math.hypot(a.root.position.x-8,a.root.position.z)<=.36+1e-8);
  assert(angles.length>0);
  assert(path.some(([x,z])=>Math.abs(z)>1.4&&Math.abs(x)<2),
    'The actor must physically skirt the footprint instead of tunnelling');
  return path;
}
assert.deepEqual(travel(),travel(),'Repeated A* and physics runs must reproduce every step');

const game=readFileSync(new URL('../app/game.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert(html.includes('rts-actor-navigation.js'));
assert(game.includes('window.FightersActorNavigation.create({'));
assert(game.includes('return actorNavigation.approachBuilding(actor,building)'));
assert(game.includes('return actorNavigation.navigateActor(actor,target,dt,mode)'));
console.log('PASS actor navigation: perimeter fairness, A* caches, exact arrival, route pruning, recovery, deterministic swept-circle trajectories.');
