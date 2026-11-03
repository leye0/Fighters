/* Fighters RTS navigation, adapted from leye0/WarConquer/scripts/perception-brain.js.
 * 8-neighbour octile A*, no diagonal corner cutting, swept circular collision,
 * line-of-sight smoothing and reachable stand-off goals. No Three.js dependency.
 * Public global window.FightersNavigation; Node: module.exports.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersNavigation=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 function pointInside(box,x,z,padding=0){
   return x>=box.minX-padding&&x<=box.maxX+padding&&z>=box.minZ-padding&&z<=box.maxZ+padding;
 }
 // 2D geometry is expressed solely in the original GLB world X/Z plane.
 // Each polygon consists of exterior and optional hole rings; no rectangular
 // approximation is used for solid building contours.
 function ringContains(ring,x,z){
   let inside=false;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
     const a=ring[i],b=ring[j];
     if((a[1]>z)!==(b[1]>z)&&
       x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
   }
   return inside;
 }
 function insideFootprint(b,x,z){
   if(b.shape!=='polygon')return pointInside(b,x,z);
   if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return false;
   return b.polygons.some(poly=>ringContains(poly[0],x,z)&&
     !poly.slice(1).some(hole=>ringContains(hole,x,z)));
 }
 function nearestSegmentPoint(p,a,b){
   const dx=b.x-a.x,dz=b.z-a.z;
   const length=dx*dx+dz*dz;
   const t=length?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/length,0,1):0;
   return {x:a.x+dx*t,z:a.z+dz*t};
 }
 function polygonEdges(b){
   if(b._edges)return b._edges;
   const edges=[];
   for(const poly of b.polygons||[])for(const ring of poly)
     for(let i=0;i<ring.length;i++){
       const v=ring[i],w=ring[(i+1)%ring.length];
       if(v[0]!==w[0]||v[1]!==w[1])
         edges.push([{x:v[0],z:v[1]},{x:w[0],z:w[1]}]);
     }
   return edges;
 }
 function closestFootprintPoint(p,b){
   if(b.shape!=='polygon'){
     const x=clamp(p.x,b.minX,b.maxX),z=clamp(p.z,b.minZ,b.maxZ);
     if(x!==p.x||z!==p.z)return {x,z};
     const faces=[
       {x:b.minX,z:p.z},{x:b.maxX,z:p.z},
       {x:p.x,z:b.minZ},{x:p.x,z:b.maxZ}];
     return faces.reduce((best,q)=>distance(p,q)<distance(p,best)?q:best);
   }
   let best=null,d2=Infinity;
   for(const [a,c] of polygonEdges(b)){
     const q=nearestSegmentPoint(p,a,c);
     const d=(q.x-p.x)**2+(q.z-p.z)**2;
     if(d<d2){d2=d;best=q;}
   }
   return best;
 }
 function boundaryDistance(p,b){
   const closest=closestFootprintPoint(p,b);
   return closest?distance(p,closest):Infinity;
 }
 function distanceToFootprint(p,b){
   if(b.shape!=='polygon')
     return Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),
       Math.max(b.minZ-p.z,0,p.z-b.maxZ));
   if(p.x<b.minX-1||p.x>b.maxX+1||p.z<b.minZ-1||p.z>b.maxZ+1){
     // Cheap broadphase, but still use the exact edge distance as result.
   }
   return insideFootprint(b,p.x,p.z)?0:boundaryDistance(p,b);
 }
 function cross(a,b,c){
   return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 }
 function segmentsIntersect(a,b,c,d){
   const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);
   const eps=1e-10;
   if(((p>eps&&q<-eps)||(p<-eps&&q>eps))&&
      ((r>eps&&s<-eps)||(r<-eps&&s>eps)))return true;
   if(Math.abs(p)<eps&&distance(nearestSegmentPoint(c,a,b),c)<eps)return true;
   if(Math.abs(q)<eps&&distance(nearestSegmentPoint(d,a,b),d)<eps)return true;
   if(Math.abs(r)<eps&&distance(nearestSegmentPoint(a,c,d),a)<eps)return true;
   if(Math.abs(s)<eps&&distance(nearestSegmentPoint(b,c,d),b)<eps)return true;
   return false;
 }
 function segmentGap(a,b,c,d){
   if(segmentsIntersect(a,b,c,d))return 0;
   return Math.min(distance(a,nearestSegmentPoint(a,c,d)),
     distance(b,nearestSegmentPoint(b,c,d)),
     distance(c,nearestSegmentPoint(c,a,b)),
     distance(d,nearestSegmentPoint(d,a,b)));
 }
 function segmentHitsFootprint(from,to,b,radius=0){
   if(b.shape!=='polygon')return segmentHitsBox(from,to,b,radius);
   const minX=Math.min(from.x,to.x)-radius,maxX=Math.max(from.x,to.x)+radius;
   const minZ=Math.min(from.z,to.z)-radius,maxZ=Math.max(from.z,to.z)+radius;
   if(maxX<b.minX||minX>b.maxX||maxZ<b.minZ||minZ>b.maxZ)return false;
   if(insideFootprint(b,from.x,from.z)||insideFootprint(b,to.x,to.z))
     return true;
   for(const [a,c] of polygonEdges(b))
     if(segmentGap(from,to,a,c)<=radius+1e-9)return true;
   return false;
 }
 function cellHitsFootprint(cell,b,radius){
   if(b.shape!=='polygon')
     return cell.minX<=b.maxX+radius&&cell.maxX>=b.minX-radius&&
       cell.minZ<=b.maxZ+radius&&cell.maxZ>=b.minZ-radius;
   if(cell.maxX<b.minX-radius||cell.minX>b.maxX+radius||
      cell.maxZ<b.minZ-radius||cell.minZ>b.maxZ+radius)return false;
   const corners=[
     {x:cell.minX,z:cell.minZ},{x:cell.maxX,z:cell.minZ},
     {x:cell.maxX,z:cell.maxZ},{x:cell.minX,z:cell.maxZ}];
   if(corners.some(p=>distanceToFootprint(p,b)<=radius))return true;
   for(const [a,c] of polygonEdges(b)){
     if([a,c].some(p=>p.x>=cell.minX-radius&&p.x<=cell.maxX+radius&&
       p.z>=cell.minZ-radius&&p.z<=cell.maxZ+radius))return true;
     for(let i=0;i<4;i++)
       if(segmentGap(a,c,corners[i],corners[(i+1)%4])<=radius)return true;
   }
   return false;
 }
 function footprintsOverlap(a,b,margin=0){
   if(a.maxX+margin<b.minX||b.maxX+margin<a.minX||
      a.maxZ+margin<b.minZ||b.maxZ+margin<a.minZ)return false;
   const polygonVertices=region=>region.shape==='polygon'?
     region.polygons.flatMap(poly=>poly[0].map(p=>({x:p[0],z:p[1]}))):
     [{x:region.minX,z:region.minZ},{x:region.maxX,z:region.minZ},
      {x:region.maxX,z:region.maxZ},{x:region.minX,z:region.maxZ}];
   if(polygonVertices(a).some(p=>distanceToFootprint(p,b)<=margin)||
      polygonVertices(b).some(p=>distanceToFootprint(p,a)<=margin))return true;
   const edgesA=a.shape==='polygon'?polygonEdges(a):[
     [{x:a.minX,z:a.minZ},{x:a.maxX,z:a.minZ}],
     [{x:a.maxX,z:a.minZ},{x:a.maxX,z:a.maxZ}],
     [{x:a.maxX,z:a.maxZ},{x:a.minX,z:a.maxZ}],
     [{x:a.minX,z:a.maxZ},{x:a.minX,z:a.minZ}]];
   const edgesB=b.shape==='polygon'?polygonEdges(b):[
     [{x:b.minX,z:b.minZ},{x:b.maxX,z:b.minZ}],
     [{x:b.maxX,z:b.minZ},{x:b.maxX,z:b.maxZ}],
     [{x:b.maxX,z:b.maxZ},{x:b.minX,z:b.maxZ}],
     [{x:b.minX,z:b.maxZ},{x:b.minX,z:b.minZ}]];
   return edgesA.some(([a0,a1])=>edgesB.some(([b0,b1])=>
     segmentGap(a0,a1,b0,b1)<=margin));
 }

 // Swept circle against expanded obstacle AABB, WarConquer's slab intersection.
 function segmentHitsBox(from,to,box,radius){
   let near=0,far=1;
   for(const [start,delta,min,max] of [
     [from.x,to.x-from.x,box.minX-radius,box.maxX+radius],
     [from.z,to.z-from.z,box.minZ-radius,box.maxZ+radius]
   ]){
     if(Math.abs(delta)<1e-12){if(start<min||start>max)return false;}
     else{
       const a=(min-start)/delta,b=(max-start)/delta;
       near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
       if(near>far)return false;
     }
   }
   return true;
 }
 class Heap{
   constructor(){this.values=[];}
   get size(){return this.values.length;}
   push(item){
     const a=this.values;let i=a.length;a.push(item);
     while(i>0){const p=(i-1)>>1;if(a[p].priority<=item.priority)break;a[i]=a[p];i=p;}a[i]=item;
   }
   pop(){
     const a=this.values,first=a[0],last=a.pop();if(!a.length)return first;
     let i=0;while(i*2+1<a.length){
       let c=i*2+1;if(c+1<a.length&&a[c+1].priority<a[c].priority)c++;
       if(a[c].priority>=last.priority)break;a[i]=a[c];i=c;
     }a[i]=last;return first;
   }
 }
 class Navigator {
   constructor({halfSize=28,cellSize=1,radius=.38}={}){
     this.halfSize=halfSize;this.cellSize=cellSize;this.radius=radius;this.version=0;this.obstacles=[];
     this.side=Math.ceil(2*halfSize/cellSize);
     this._blocked=null;
   }
   setObstacles(obstacles){
     if(!Array.isArray(obstacles)||obstacles.some(b=>
       ![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||
       b.minX>=b.maxX||b.minZ>=b.maxZ||
       b.shape==='polygon'&&(!Array.isArray(b.polygons)||!b.polygons.length||
         b.polygons.some(poly=>!poly.length||!poly[0].length))))
       throw Error('Each obstacle needs a valid nonempty polygon or legacy AABB');
     this.obstacles=obstacles.map(b=>{
       const copy={...b};
       if(copy.shape==='polygon')copy._edges=polygonEdges(copy);
       return copy;
     });
     // Polygon-edge/cell intersections are expensive. Compute conservative
     // occupancy only when the building set changes, NOT during every A* step.
     const blocked=new Uint8Array(this.side*this.side);
     for(let z=0;z<this.side;z++)for(let x=0;x<this.side;x++){
       const minX=-this.halfSize+x*this.cellSize;
       const minZ=-this.halfSize+z*this.cellSize;
       const square={minX,maxX:minX+this.cellSize,
         minZ,maxZ:minZ+this.cellSize};
       if(this.obstacles.some(b=>cellHitsFootprint(square,b,this.radius+.04)))
         blocked[this.index(x,z)]=1;
     }
     this._blocked=blocked;
     this.version++;
   }
   clamp(p){
     const edge=this.halfSize-this.radius-.08;
     return {x:clamp(p.x,-edge,edge),z:clamp(p.z,-edge,edge)};
   }
   pointClear(p){
     const limit=this.halfSize-this.radius-.05;
     return Math.abs(p.x)<=limit&&Math.abs(p.z)<=limit&&
       !this.obstacles.some(b=>{
         if(p.x<b.minX-this.radius||p.x>b.maxX+this.radius||
            p.z<b.minZ-this.radius||p.z>b.maxZ+this.radius)return false;
         return distanceToFootprint(p,b)<=this.radius;
       });
   }
   segmentClear(from,to){
     if(!this.pointClear(from)||!this.pointClear(to))return false;
     return !this.obstacles.some(b=>segmentHitsFootprint(from,to,b,this.radius));
   }
   index(x,z){return z*this.side+x;}
   coord(i){return {x:i%this.side,z:Math.floor(i/this.side)};}
   cell(p){
     return {x:Math.floor((p.x+this.halfSize)/this.cellSize),z:Math.floor((p.z+this.halfSize)/this.cellSize)};
   }
   center(c){
     return {x:-this.halfSize+(c.x+.5)*this.cellSize,z:-this.halfSize+(c.z+.5)*this.cellSize};
   }
   inside(c){return c.x>=0&&c.z>=0&&c.x<this.side&&c.z<this.side;}
   cellBlocked(c){
     if(!this.inside(c))return true;
     return this._blocked?this._blocked[this.index(c.x,c.z)]===1:false;
   }
   findSafeGoal(request){
     const goal=this.clamp(request),raw=this.cell(goal);
     // The physical circle may fit beside a wall even when its 1m grid
     // cell conservatively intersects the wall. Preserve that exact attack
     // standoff point; planning connects from a clear neighbour cell.
     if(this.pointClear(goal))return goal;
     // As in WarConquer's approachGoal, do not navigate to an occupied centre.
     // Pick an actually navigable interaction cell nearest to the requested point.
     let best=null,score=Infinity;
     for(let z=0;z<this.side;z++)for(let x=0;x<this.side;x++){
       const c={x,z};if(this.cellBlocked(c))continue;
       const p=this.center(c),s=distance(p,goal);
       if(s<score){score=s;best=p;}
     }
     return best;
   }
   findPath(from,goal){
     const start=this.cell(from),end=this.cell(goal);
     if(!this.inside(start)||!this.inside(end))return null;
     const startId=this.index(start.x,start.z),endId=this.index(end.x,end.z);
     const count=this.side*this.side;
     const costs=new Float64Array(count).fill(Infinity);
     const parent=new Int32Array(count).fill(-1);
     const heuristic=c=>{
       const dx=Math.abs(c.x-end.x),dz=Math.abs(c.z-end.z);
       return dx+dz+(Math.SQRT2-2)*Math.min(dx,dz);
     };
     const heap=new Heap();costs[startId]=0;
     heap.push({id:startId,cost:0,priority:heuristic(start)});
     let explored=0;
     while(heap.size&&explored++<count*4){
       const current=heap.pop();
       if(current.cost!==costs[current.id])continue;
       if(current.id===endId){
         const route=[];let id=endId;
         while(id!==startId){
           if(id<0)return null;
           route.push(this.center(this.coord(id)));id=parent[id];
         }
         route.reverse();return route;
       }
       const c=this.coord(current.id);
       for(const [dx,dz] of directions){
         const n={x:c.x+dx,z:c.z+dz};
         if(this.cellBlocked(n))continue;
         // No clipping through two touching diagonal walls, WarConquer rule.
         if(dx&&dz&&(this.cellBlocked({x:c.x+dx,z:c.z})||
                     this.cellBlocked({x:c.x,z:c.z+dz})))continue;
         const id=this.index(n.x,n.z);
         const next=current.cost+(dx&&dz?Math.SQRT2:1);
         if(next>=costs[id])continue;
         costs[id]=next;parent[id]=current.id;
         heap.push({id,cost:next,priority:next+heuristic(n)});
       }
     }
     return null;
   }
   plan(from,requested){
     const goal=this.findSafeGoal(requested);
     if(!goal)return null;
     if(distance(from,goal)<.12)return {goal,waypoints:[],version:this.version};
     if(this.segmentClear(from,goal))return {goal,waypoints:[goal],version:this.version};
     let cells=null;
     const endpoint=this.cell(goal);
     if(!this.cellBlocked(endpoint)){
       cells=this.findPath(from,goal);
     }else{
       // A* uses inflated occupancy for safe diagonal edges. A legal melee
       // endpoint immediately outside a building can share a BLOCKED cell
       // without being physically obstructed. Reach it from a free cell.
       const candidates=[];
       for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){
         const c={x:endpoint.x+dx,z:endpoint.z+dz};
         if(this.cellBlocked(c))continue;
         const p=this.center(c);
         if(this.segmentClear(p,goal))candidates.push({p,d:distance(p,goal)});
       }
       candidates.sort((a,b)=>a.d-b.d);
       for(const {p} of candidates.slice(0,18)){
         const route=this.findPath(from,p);
         if(route){cells=route;break;}
       }
     }
     if(!cells)return null;
     const candidates=[...cells,goal],waypoints=[];let current=from,index=0;
     while(index<candidates.length){
       let furthest=index;
       for(let i=candidates.length-1;i>=index;i--){
         if(this.segmentClear(current,candidates[i])){furthest=i;break;}
       }
       if(!this.segmentClear(current,candidates[furthest]))return null;
       waypoints.push(candidates[furthest]);current=candidates[furthest];index=furthest+1;
     }
     return {goal,waypoints,version:this.version};
   }
   // Deterministic radius-aware step; never cross an obstacle even if a path is stale.
   advance(from,waypoint,distanceBudget){
     const gap=distance(from,waypoint);
     if(gap<1e-9)return {...from};
     const portion=Math.min(1,Math.max(0,distanceBudget)/gap);
     const next={x:from.x+(waypoint.x-from.x)*portion,z:from.z+(waypoint.z-from.z)*portion};
     return this.segmentClear(from,next)?next:null;
   }
   findSafeSpawn(position){
     return this.findSafeGoal(position);
   }
 }
 return {Navigator,pointInside,segmentHitsBox,insideFootprint,closestFootprintPoint,
   boundaryDistance,distanceToFootprint,segmentHitsFootprint,
   footprintsOverlap,cellHitsFootprint};
});
