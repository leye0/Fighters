/* Exact X/Z footprint utilities for triangulated low structural geometry.
 * 3D GLB triangles are clipped at the structural level, then polygon-unioned.
 * No raster grid or guessed rectangular collision footprint.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersFootprint=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const signedArea=ring=>{
  let area=0;
  for(let i=0;i<ring.length;i++){
   const p=ring[i],q=ring[(i+1)%ring.length];
   area+=p[0]*q[1]-q[0]*p[1];
  }
  return area/2;
 };
 function clipTriangleBelow(vertices,cutoff){
  const result=[];
  for(let i=0;i<vertices.length;i++){
   const a=vertices[i],b=vertices[(i+1)%vertices.length];
   const aIn=a.y<=cutoff,bIn=b.y<=cutoff;
   if(aIn)result.push(a);
   if(aIn!==bIn){
    const t=(cutoff-a.y)/(b.y-a.y);
    result.push({x:a.x+(b.x-a.x)*t,y:cutoff,z:a.z+(b.z-a.z)*t});
   }
  }
  return result;
 }
 function unionTriangles(triangles,union){
  if(typeof union!=='function')throw Error('Polygon union library not loaded');
  let combined=[];
  const batch=[];
  const flush=()=>{
   if(!batch.length)return;
   const region=union(...batch);
   combined=combined.length?union(combined,region):region;
   batch.length=0;
  };
  for(const triangle of triangles){
   const ring=triangle.map(p=>Array.isArray(p)?p:[p.x,p.z]);
   if(ring.length<3||Math.abs(signedArea(ring))<1e-10)continue;
   batch.push([ring]);
   if(batch.length>=64)flush();
  }
  flush();
  if(!combined.length)throw Error('No projected structural triangles for building');
  return combined;
 }
 function makeFootprint(polygons,minY=0,maxY=0){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const polygon of polygons)for(const ring of polygon)for(const p of ring){
   minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);
   minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);
  }
  if(!Number.isFinite(minX)||minX>=maxX||minZ>=maxZ)
   throw Error('Degenerate polygonal building footprint');
  return {shape:'polygon',polygons,minX,maxX,minZ,maxZ,minY,maxY};
 }
 function translateFootprint(footprint,dx,dz){
  return makeFootprint(footprint.polygons.map(poly=>poly.map(ring=>ring.map(
   p=>[p[0]+dx,p[1]+dz]))),footprint.minY,footprint.maxY);
 }
 function outlineEdges(footprint){
  const edges=[];
  for(const polygon of footprint.polygons||[])for(const ring of polygon)
   for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    if(a[0]===b[0]&&a[1]===b[1])continue;
    edges.push([{x:a[0],z:a[1]},{x:b[0],z:b[1]}]);
   }
  return edges;
 }
 return {signedArea,clipTriangleBelow,unionTriangles,makeFootprint,
  translateFootprint,outlineEdges};
});
