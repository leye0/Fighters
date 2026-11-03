/* Exact 2D collision and proximity queries for projected building silhouettes.
 * Every collider is a union of one or more polygon rings derived from glTF
 * triangles, with holes preserved. AABB fields are broadphase ONLY.
 * No manually guessed world-unit footprint size or roof cutoff.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersFootprints=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const EPS=1e-9;
 const sq=n=>n*n;
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const point=(v)=>Array.isArray(v)?{x:v[0],z:v[1]}:v;
 const ringPoints=ring=>ring.map(point);
 function pointSegment(p,a,b){
   a=point(a);b=point(b);
   const dx=b.x-a.x,dz=b.z-a.z,denom=dx*dx+dz*dz;
   const t=denom<EPS?0:Math.max(0,Math.min(1,
     ((p.x-a.x)*dx+(p.z-a.z)*dz)/denom));
   const closest={x:a.x+dx*t,z:a.z+dz*t};
   return {closest,distance:dist(p,closest),t};
 }
 function cross(a,b,c){return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);}
 function onSegment(p,a,b){
   return Math.abs(cross(a,b,p))<EPS&&
     p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&
     p.z>=Math.min(a.z,b.z)-EPS&&p.z<=Math.max(a.z,b.z)+EPS;
 }
 function segmentsIntersect(a,b,c,d){
   const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
   if(Math.abs(abC)<EPS&&onSegment(c,a,b))return true;
   if(Math.abs(abD)<EPS&&onSegment(d,a,b))return true;
   if(Math.abs(cdA)<EPS&&onSegment(a,c,d))return true;
   if(Math.abs(cdB)<EPS&&onSegment(b,c,d))return true;
   return (abC>0)!==(abD>0)&&(cdA>0)!==(cdB>0);
 }
 function segmentDistance(a,b,c,d){
   if(segmentsIntersect(a,b,c,d))return 0;
   return Math.min(pointSegment(a,c,d).distance,
     pointSegment(b,c,d).distance,
     pointSegment(c,a,b).distance,
     pointSegment(d,a,b).distance);
 }
 function inRing(p,ring){
   let within=false;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
     const a=point(ring[j]),b=point(ring[i]);
     if(onSegment(p,a,b))return true;
     if((a.z>p.z)!==(b.z>p.z)&&
       p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)within=!within;
   }
   return within;
 }
 function shapeFromPolygons(polygons){
   if(!Array.isArray(polygons)||!polygons.length)
     throw Error('Collision must contain real glTF projected polygons');
   let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
   let vertexCount=0,outerCount=0;
   for(const poly of polygons){
     if(!poly.length||poly[0].length<3)throw Error('Empty projected silhouette');
     outerCount++;
     for(const ring of poly){
       if(ring.length<3)throw Error('Short silhouette loop');
       for(const v of ring){
         const p=point(v);
         if(!Number.isFinite(p.x)||!Number.isFinite(p.z))throw Error('Nonfinite footprint vertex');
         minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
         minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
         vertexCount++;
       }
     }
   }
   if(!(maxX>minX&&maxZ>minZ))throw Error('Zero-area footprint');
   return {shape:'polygon',polygons,minX,maxX,minZ,maxZ,vertexCount,outerCount};
 }
 function inside(p,shape){
   if(shape.shape!=='polygon')return p.x>=shape.minX&&p.x<=shape.maxX&&
     p.z>=shape.minZ&&p.z<=shape.maxZ;
   if(p.x<shape.minX-EPS||p.x>shape.maxX+EPS||
     p.z<shape.minZ-EPS||p.z>shape.maxZ+EPS)return false;
   return shape.polygons.some(poly=>{
     if(!inRing(p,poly[0]))return false;
     return !poly.slice(1).some(hole=>inRing(p,hole));
   });
 }
 function edges(shape){
   const result=[];
   for(const poly of shape.polygons||[])for(const ring of poly)
     for(let i=0;i<ring.length;i++){
       const a=point(ring[i]),b=point(ring[(i+1)%ring.length]);
       if(dist(a,b)>EPS)result.push([a,b]);
     }
   return result;
 }
 function closestBoundary(p,shape){
   let best={distance:Infinity,closest:null,a:null,b:null};
   for(const [a,b] of edges(shape)){
     const q=pointSegment(p,a,b);
     if(q.distance<best.distance)best={...q,a,b};
   }
   return best;
 }
 function distanceTo(p,shape){
   if(shape.shape!=='polygon'){
     return Math.hypot(Math.max(shape.minX-p.x,0,p.x-shape.maxX),
       Math.max(shape.minZ-p.z,0,p.z-shape.maxZ));
   }
   if(inside(p,shape))return 0;
   return closestBoundary(p,shape).distance;
 }
 function pointBlocked(p,shape,radius=0){
   if(p.x<shape.minX-radius||p.x>shape.maxX+radius||
     p.z<shape.minZ-radius||p.z>shape.maxZ+radius)return false;
   return distanceTo(p,shape)<=radius+EPS;
 }
 function segmentBlocked(a,b,shape,radius=0){
   if(Math.max(a.x,b.x)<shape.minX-radius||
     Math.min(a.x,b.x)>shape.maxX+radius||
     Math.max(a.z,b.z)<shape.minZ-radius||
     Math.min(a.z,b.z)>shape.maxZ+radius)return false;
   if(pointBlocked(a,shape,radius)||pointBlocked(b,shape,radius))return true;
   if(shape.shape!=='polygon'){
     // Compatible with existing AABB-only fixtures; navigator implements its
     // optimized slab check for these separately.
     const steps=12;
     for(let i=1;i<steps;i++)if(pointBlocked({
       x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps},shape,radius))return true;
     return false;
   }
   return edges(shape).some(([c,d])=>segmentDistance(a,b,c,d)<=radius+EPS);
 }
 function polygonsOverlap(a,b){
   if(a.maxX<b.minX||a.minX>b.maxX||a.maxZ<b.minZ||a.minZ>b.maxZ)return false;
   if(a.shape!=='polygon'||b.shape!=='polygon')
     return a.minX<=b.maxX&&a.maxX>=b.minX&&
       a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
   for(const [p,q] of edges(a))
     for(const [r,s] of edges(b))if(segmentsIntersect(p,q,r,s))return true;
   // Sample polygon's *outer* vertices (not holes) to test containment.
   return a.polygons.some(poly=>inside(point(poly[0][0]),b))||
     b.polygons.some(poly=>inside(point(poly[0][0]),a));
 }
 function cellBlocked(rect,shape,radius=0){
   if(shape.shape!=='polygon')
     return rect.minX<=shape.maxX+radius&&rect.maxX>=shape.minX-radius&&
       rect.minZ<=shape.maxZ+radius&&rect.maxZ>=shape.minZ-radius;
   if(rect.minX>shape.maxX+radius||rect.maxX<shape.minX-radius||
     rect.minZ>shape.maxZ+radius||rect.maxZ<shape.minZ-radius)return false;
   const rectShape={shape:'polygon',polygons:[[[[rect.minX,rect.minZ],
     [rect.maxX,rect.minZ],[rect.maxX,rect.maxZ],[rect.minX,rect.maxZ]]]],
     ...rect};
   if(polygonsOverlap(rectShape,shape))return true;
   // Exact Euclidean clearance between a square and the polygon boundary.
   for(const [a,b] of edges(rectShape))for(const [c,d] of edges(shape))
     if(segmentDistance(a,b,c,d)<=radius+EPS)return true;
   return false;
 }
 function translated(shape,dx,dz){
   return shapeFromPolygons(shape.polygons.map(poly=>poly.map(ring=>
     ring.map(v=>{const p=point(v);return [p.x+dx,p.z+dz];}))));
 }
 return {shapeFromPolygons,pointSegment,segmentDistance,segmentsIntersect,
   inside,edges,closestBoundary,distanceTo,pointBlocked,segmentBlocked,
   polygonsOverlap,cellBlocked,translated};
});
