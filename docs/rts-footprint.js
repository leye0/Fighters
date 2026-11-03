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
  const portions=[],batch=[],seen=new Set();
  const snap=v=>Math.round(v*100000)/100000;
  const flush=()=>{
   if(!batch.length)return;
   const region=union(...batch);
   // An entirely degenerate coplanar batch can return null after clipping.
   if(region?.length)portions.push(region);
   batch.length=0;
  };
  for(const triangle of triangles){
   // Stabilize near-identical glTF vertices at numerical, not gameplay,
   // precision. Repeated backfaces/identical projected triangles collapse.
   const ring=triangle.map(p=>Array.isArray(p)?
     [snap(p[0]),snap(p[1])]:[snap(p.x),snap(p.z)]);
   if(ring.length<3||Math.abs(signedArea(ring))<1e-8)continue;
   const key=ring.map(p=>p.join(',')).sort().join('|');
   if(seen.has(key))continue;
   seen.add(key);batch.push([ring]);
   if(batch.length>=64)flush();
  }
  flush();
  if(!portions.length)throw Error('No projected structural triangles for building');
  // Balanced binary union is dramatically faster and more stable than
  // repeatedly unioning an ever-growing 10k-edge silhouette with 64 triangles.
  let level=portions;
  while(level.length>1){
   const next=[];
   for(let i=0;i<level.length;i+=2){
    if(i+1===level.length){next.push(level[i]);continue;}
    const merged=union(level[i],level[i+1]);
    if(merged?.length)next.push(merged);
    else next.push([...level[i],...level[i+1]]);
   }
   level=next;
  }
  if(!level[0]?.length)throw Error('Failed to produce polygon footprint');
  return level[0];
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
