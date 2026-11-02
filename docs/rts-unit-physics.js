/* Continuous circular unit collision and local sidestepping for Fighters RTS.
 * Small, deterministic, dependency-free physics shared by Node regression
 * tests and the browser. Units never tunnel through another stationary unit.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersUnitPhysics=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const RADIUS=.45;
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 function sweptCircleHit(start,end,obstacle,radius=RADIUS){
  const dx=end.x-start.x,dz=end.z-start.z;
  const length2=dx*dx+dz*dz;
  const t=length2>1e-12?
   Math.max(0,Math.min(1,((obstacle.x-start.x)*dx+(obstacle.z-start.z)*dz)/length2)):0;
  const x=start.x+dx*t,z=start.z+dz*t;
  return Math.hypot(x-obstacle.x,z-obstacle.z)<radius*2-.015;
 }
 function freeForUnit(start,end,agent,units,nav,radius=RADIUS){
  if(!nav.segmentClear(start,end))return false;
  for(const other of units){
   if(other===agent||other.dead)continue;
   const p=other.root?.position||other;
   const currentDist=distance(start,p),nextDist=distance(end,p);
   if(currentDist<radius*2-.015){
    // Resolve legacy overlap by allowing only motion that opens the gap.
    if(nextDist<currentDist+.001)return false;
   }else if(sweptCircleHit(start,end,p,radius))return false;
  }
  return true;
 }
 function step(from,destination,budget,agent,units,nav,radius=RADIUS){
  const dx=destination.x-from.x,dz=destination.z-from.z;
  const gap=Math.hypot(dx,dz);
  if(gap<1e-8||budget<=0)return null;
  const length=Math.min(budget,gap);
  const ux=dx/gap,uz=dz/gap;
  // The direct vector gets first priority, then gentle right/left sidesteps.
  // ±75° retain forward progress; no teleportation or backwards runaway.
  const angles=[0,.32,-.32,.65,-.65,1.1,-1.1,1.4,-1.4,Math.PI/2,-Math.PI/2,1.9,-1.9];
  for(const angle of angles){
   const c=Math.cos(angle),v=Math.sin(angle);
   const end={x:from.x+length*(ux*c-uz*v),z:from.z+length*(ux*v+uz*c)};
   if(freeForUnit(from,end,agent,units,nav,radius))return end;
  }
  return null;
 }
 function separate(units,nav,radius=RADIUS){
  let corrections=0;
  const alive=units.filter(a=>!a.dead);
  for(let pass=0;pass<3;pass++){
   let changed=false;
   for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){
    const a=alive[i],b=alive[j],ap=a.root?.position||a,bp=b.root?.position||b;
    let dx=bp.x-ap.x,dz=bp.z-ap.z,d=Math.hypot(dx,dz);
    const minimum=2*radius+.02;
    if(d>=minimum)continue;
    if(d<.0001){
     // Fixed tie-breaker avoids random jitter for identical spawn positions.
     const angle=((a.id||i)*23+(b.id||j)*11)*2.399963229728653;
     dx=Math.cos(angle);dz=Math.sin(angle);d=1;
    }
    const nx=dx/d,nz=dz/d,move=(minimum-d)/2+.0005;
    const left={x:ap.x-nx*move,z:ap.z-nz*move};
    const right={x:bp.x+nx*move,z:bp.z+nz*move};
    const canA=nav.pointClear(left),canB=nav.pointClear(right);
    if(canA&&canB){
      ap.x=left.x;ap.z=left.z;bp.x=right.x;bp.z=right.z;changed=true;corrections++;
    }else if(canA){
      const extra={x:ap.x-nx*move*2,z:ap.z-nz*move*2};
      if(nav.pointClear(extra)){ap.x=extra.x;ap.z=extra.z;changed=true;corrections++;}
    }else if(canB){
      const extra={x:bp.x+nx*move*2,z:bp.z+nz*move*2};
      if(nav.pointClear(extra)){bp.x=extra.x;bp.z=extra.z;changed=true;corrections++;}
    }
   }
   if(!changed)break;
  }
  return corrections;
 }
 return {RADIUS,distance,sweptCircleHit,freeForUnit,step,separate};
});
