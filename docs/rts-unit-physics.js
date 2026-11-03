/* Soft crowd steering for Fighters RTS.
 * Buildings and map borders are hard collision. Other units are NOT walls:
 * prefer free space, adjust locally, and pass through crowded units if needed.
 * This mirrors RTS-style local avoidance + dispersion instead of rigid bodies.
 * Dependency-free: used by browser and Node regression tests.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersUnitPhysics=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const RADIUS=.45;
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const location=actor=>actor.root?.position||actor;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const MIN_SPACING=2*RADIUS+.14;
 // Retained as a geometric *query* for QA; unlike buildings, agents
 // do not make a candidate impassable.
 function sweptCircleHit(start,end,obstacle,radius=RADIUS){
  const dx=end.x-start.x,dz=end.z-start.z;
  const length2=dx*dx+dz*dz;
  const t=length2>1e-12?clamp(
   ((obstacle.x-start.x)*dx+(obstacle.z-start.z)*dz)/length2,0,1):0;
  return Math.hypot(start.x+dx*t-obstacle.x,start.z+dz*t-obstacle.z)<radius*2-.015;
 }
 function freeForUnit(start,end,agent,units,nav){
  // This function deliberately answers only HARD clearance; overlapping
  // agents are resolved by steering preference rather than an absolute veto.
  return nav.segmentClear(start,end);
 }
 function crowdPenalty(end,from,agent,units,radius=RADIUS){
  const preferred=Math.max(radius*2+.14,MIN_SPACING);
  let penalty=0;
  for(const other of units){
   if(other===agent||other.dead)continue;
   const p=location(other);
   const d=distance(end,p);
   if(d>=preferred*1.7)continue;
   // Smooth short-range repulsion, larger when predicted centers overlap.
   const shortfall=clamp((preferred-d)/preferred,0,1);
   penalty+=shortfall*shortfall*2.8;
   // Anticipate head-on contacts without treating the body as solid.
   if(d>preferred*.7&&sweptCircleHit(from,end,p,radius))
     penalty+=.3;
  }
  return penalty;
 }
 function step(from,destination,budget,agent,units,nav,radius=RADIUS){
  const dx=destination.x-from.x,dz=destination.z-from.z;
  const gap=Math.hypot(dx,dz);
  if(gap<1e-8||budget<=0)return null;
  const length=Math.min(budget,gap),ux=dx/gap,uz=dz/gap;
  // Candidate velocities retain forward progress; local crowd pressure
  // chooses a lane when available. Forward remains a legal fallback.
  const side=(agent?.id||0)%2===0?1:-1;
  const angles=[0,.22*side,-.22*side,.43*side,-.43*side,
   .68*side,-.68*side,1.02*side,-1.02*side];
  let best=null,bestScore=-Infinity;
  for(const angle of angles){
   const c=Math.cos(angle),v=Math.sin(angle);
   const end={x:from.x+length*(ux*c-uz*v),z:from.z+length*(ux*v+uz*c)};
   if(!nav.segmentClear(from,end))continue;
   const progress=(gap-distance(end,destination))/length;
   // A look-ahead sample sees the nearby queue BEFORE the one-frame
   // displacement touches it. This is steering, not a swept hard collision.
   const previewDistance=Math.min(gap,Math.max(length,radius*2.9));
   const preview={x:from.x+previewDistance*(ux*c-uz*v),
     z:from.z+previewDistance*(ux*v+uz*c)};
   const crowdNow=crowdPenalty(end,from,agent,units,radius);
   const crowdAhead=nav.segmentClear(from,preview)?
     crowdPenalty(preview,from,agent,units,radius):0;
   // Once inside the assigned formation slot's landing radius, continue
   // towards that slot instead of orbiting a nearby friend forever.
   const landingWeight=clamp((gap-.45)/1.25,0,1);
   const congestion=(crowdNow*.55+crowdAhead*1.25)*landingWeight;
   const score=progress*1.5-congestion-Math.abs(angle)*.10;
   if(score>bestScore){best=end;bestScore=score;}
  }
  // null is returned ONLY if terrain/buildings block all candidate steps.
  // In a corridor the best permitted step can pass through another unit.
  return best;
 }
 function separate(units,nav,radius=RADIUS,dt=1/60){
  // Gentle post-movement relaxation: use short capped nudges and do NOT
  // enforce a hard minimum distance when no free surrounding space exists.
  const alive=units.filter(a=>!a.dead),minDistance=2*radius+.06;
  const maxShift=clamp(dt*2.8,0,.09);
  let corrections=0;
  const forces=new Map();
  for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){
   const a=alive[i],b=alive[j],ap=location(a),bp=location(b);
   let dx=bp.x-ap.x,dz=bp.z-ap.z,d=Math.hypot(dx,dz);
   if(d>=minDistance)continue;
   if(d<.00001){
    const angle=((a.id||i+1)*23+(b.id||j+1)*11)*2.399963229728653;
    dx=Math.cos(angle);dz=Math.sin(angle);d=1; // deterministic tie-break
   }
   const pressure=(minDistance-Math.hypot(bp.x-ap.x,bp.z-ap.z))/minDistance;
   const nx=dx/d,nz=dz/d;
   const fa=forces.get(a)||{x:0,z:0},fb=forces.get(b)||{x:0,z:0};
   fa.x-=nx*pressure;fa.z-=nz*pressure;
   fb.x+=nx*pressure;fb.z+=nz*pressure;
   forces.set(a,fa);forces.set(b,fb);
  }
  for(const [actor,force] of forces){
   const current=location(actor),magnitude=Math.hypot(force.x,force.z);
   if(magnitude<1e-8)continue;
   const shift=Math.min(maxShift,magnitude*maxShift);
   const next={x:current.x+force.x/magnitude*shift,z:current.z+force.z/magnitude*shift};
   if(nav.segmentClear(current,next)){
    current.x=next.x;current.z=next.z;corrections++;
   }
   // If a building blocks this correction, leave agents temporarily
   // overlapping; never push anyone through a solid structure.
  }
  return corrections;
 }
 // Reserve individual slots for the whole group BEFORE anyone starts moving.
 // findSafeGoal() alone may snap multiple offset requests onto the exact same
 // pathfinding cell next to a building: no amount of steering can fix that.
 function formationGoals(actors,centre,nav,{spacing=1.35}={}){
  if(!actors.length)return [];
  const origin=nav.clamp(centre),slots=[],eligible=[];
  const ringLimit=Math.max(8,Math.ceil(Math.sqrt(actors.length))*3+3);
  for(let ring=0;ring<=ringLimit;ring++){
   for(let z=-ring;z<=ring;z++)for(let x=-ring;x<=ring;x++){
    if(Math.max(Math.abs(x),Math.abs(z))!==ring)continue;
    const p={x:origin.x+x*spacing,z:origin.z+z*spacing};
    if(!nav.pointClear(p))continue;
    slots.push(p);
   }
   if(slots.length>=actors.length*3)break;
  }
  slots.sort((a,b)=>distance(a,origin)-distance(b,origin)||
    a.z-b.z||a.x-b.x);
  const assigned=new Map(),available=[...actors].sort((a,b)=>
    distance(location(a),origin)-distance(location(b),origin)||
    (a.id||0)-(b.id||0));
  for(const actor of available){
   let best=-1,bestScore=Infinity;
   const start=location(actor);
   for(let j=0;j<slots.length;j++){
    const slot=slots[j];
    if(eligible[j]===false)continue;
    const delta=distance(start,slot);
    const centreCost=distance(origin,slot);
    const score=delta+centreCost*.24;
    if(score>=bestScore)continue;
    // A crowded slot is not a valid assignment if the unit cannot route to it.
    // A* is evaluated only for promising slots, never every candidate.
    if(!nav.segmentClear(start,slot)&&!nav.plan(start,slot))continue;
    best=j;bestScore=score;
   }
   if(best<0){assigned.set(actor,null);continue;}
   assigned.set(actor,slots[best]);eligible[best]=false;
  }
  return actors.map(actor=>assigned.get(actor)||null);
 }
 return {RADIUS,MIN_SPACING,distance,sweptCircleHit,freeForUnit,
  crowdPenalty,step,separate,formationGoals};
});
