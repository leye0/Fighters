/* Lightweight, axis-aligned stone ramparts. Pure layout/collision data is
 * shared by the browser and deterministic Node tests. Coordinates are X/Z. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersWalls=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const LENGTH=3.2,WIDTH=.68,HEIGHT=1.55,MAX_LINK_GAP=1;
 const round=n=>Math.round(n*100)/100;
 const center=b=>b.hitbox?{x:(b.hitbox.minX+b.hitbox.maxX)/2,
  z:(b.hitbox.minZ+b.hitbox.maxZ)/2}:{x:b.x,z:b.z};
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 function shape(x,z,axis='x'){
  const dx=axis==='x'?LENGTH/2:WIDTH/2;
  const dz=axis==='z'?LENGTH/2:WIDTH/2;
  return {shape:'polygon',polygons:[[[[x-dx,z-dz],[x+dx,z-dz],
   [x+dx,z+dz],[x-dx,z+dz]]]],minX:x-dx,maxX:x+dx,
   minZ:z-dz,maxZ:z+dz,minY:0,maxY:HEIGHT};
 }
 function ends(w){
  const d=LENGTH/2;
  return w.axis==='z'?[{x:w.x,z:w.z-d},{x:w.x,z:w.z+d}]:
   [{x:w.x-d,z:w.z},{x:w.x+d,z:w.z}];
 }
 function segmentsTouch(a,b){
  return ends(a).some(e=>ends(b).some(f=>distance(e,f)<.06));
 }
 // A segment's stone caps meet at a common endpoint, including L corners.
 // Never let a wall's long body overlap another wall's long body.
 function compatible(a,b){
  const A=shape(a.x,a.z,a.axis),B=shape(b.x,b.z,b.axis);
  const overlapX=Math.min(A.maxX,B.maxX)-Math.max(A.minX,B.minX);
  const overlapZ=Math.min(A.maxZ,B.maxZ)-Math.max(A.minZ,B.minZ);
  if(overlapX<=.01||overlapZ<=.01)return true;
  return segmentsTouch(a,b)&&overlapX<=WIDTH+.02&&overlapZ<=WIDTH+.02;
 }
 function resolve(x,z,walls=[],buildings=[],preferredAxis=null){
  if(preferredAxis)return {x:round(x),z:round(z),axis:preferredAxis};
  let best=null,bestScore=1.18;
  for(const wall of walls){
   if(wall.destroyed)continue;
   for(const endpoint of ends(wall))for(const axis of ['x','z'])for(const sign of [-1,1]){
    const p={x:round(endpoint.x+(axis==='x'?sign*LENGTH/2:0)),
     z:round(endpoint.z+(axis==='z'?sign*LENGTH/2:0)),axis};
    const score=distance({x,z},p);
    if(score<bestScore&&walls.every(b=>b===wall||compatible(p,b))){best=p;bestScore=score;}
   }
  }
  if(best)return best;
  const inhabited=buildings.filter(b=>!b.destroyed&&b.type!=='wall'&&b.type!=='mine');
  const c=inhabited.length?{
   x:inhabited.reduce((n,b)=>n+center(b).x,0)/inhabited.length,
   z:inhabited.reduce((n,b)=>n+center(b).z,0)/inhabited.length}:{x:19,z:18};
  // Tangential to the village perimeter, not pointing into a building.
  return {x:round(x),z:round(z),axis:Math.abs(x-c.x)>Math.abs(z-c.z)?'z':'x'};
 }
 function perimeter(buildings,{margin=4.6}={}){
  const core=buildings.filter(b=>!b.destroyed&&b.type!=='wall'&&b.type!=='mine');
  if(!core.length)return [];
  const bounds=core.map(b=>b.hitbox||{minX:b.x-2,maxX:b.x+2,minZ:b.z-2,maxZ:b.z+2});
  const minX=Math.min(...bounds.map(b=>b.minX)),maxX=Math.max(...bounds.map(b=>b.maxX));
  const minZ=Math.min(...bounds.map(b=>b.minZ)),maxZ=Math.max(...bounds.map(b=>b.maxZ));
  const cx=round((minX+maxX)/2),cz=round((minZ+maxZ)/2);
  const nx=Math.max(2,Math.ceil((maxX-minX+2*margin)/LENGTH));
  const nz=Math.max(2,Math.ceil((maxZ-minZ+2*margin)/LENGTH));
  const west=round(cx-nx*LENGTH/2),east=round(cx+nx*LENGTH/2);
  const south=round(cz-nz*LENGTH/2),north=round(cz+nz*LENGTH/2);
  const result=[];
  // West (towards the witches) has a full two-section, 6.4 m gate;
  // flanking runs and south side get built first. No closed ring is planned.
  const gateStart=Math.floor((nz-2)/2);
  for(let i=0;i<nz;i++){
   if(i===gateStart||i===gateStart+1)continue;
   result.push({x:west,z:round(south+(i+.5)*LENGTH),axis:'z',side:'west'});
  }
  for(let i=0;i<nx;i++)result.push({x:round(west+(i+.5)*LENGTH),z:south,axis:'x',side:'south'});
  for(let i=0;i<nz;i++)result.push({x:east,z:round(south+(i+.5)*LENGTH),axis:'z',side:'east'});
  for(let i=0;i<nx;i++)result.push({x:round(west+(i+.5)*LENGTH),z:north,axis:'x',side:'north'});
  return result;
 }
 function planWall(buildings,valid,options={}){
  if(typeof valid!=='function')return null;
  const existing=buildings.filter(b=>b.type==='wall'&&!b.destroyed);
  const proposals=options.perimeter||perimeter(buildings,options);
  for(const site of proposals){
   if(existing.some(w=>distance(w,site)<.12))continue;
   if(!valid(site.x,site.z,'wall',site.axis))continue;
   // Don't build an isolated extension beyond an unbuildable piece.
   // The initial foundation is anchored to a real building by validation.
   if(existing.length&&!existing.some(w=>ends(w).some(a=>ends(site).some(b=>
     distance(a,b)<.06)))&&options.requireConnection)continue;
   return {type:'wall',x:site.x,z:site.z,axis:site.axis,side:site.side};
  }
  return null;
 }
 return {LENGTH,WIDTH,HEIGHT,MAX_LINK_GAP,shape,ends,compatible,resolve,
  perimeter,planWall};
});
