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
   }
   setObstacles(obstacles){
     if(!Array.isArray(obstacles)||obstacles.some(b=>![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||b.minX>=b.maxX||b.minZ>=b.maxZ))
       throw Error('Each obstacle needs a finite nonempty world-space AABB');
     this.obstacles=obstacles.map(b=>({...b}));this.version++;
   }
   clamp(p){
     const edge=this.halfSize-this.radius-.08;
     return {x:clamp(p.x,-edge,edge),z:clamp(p.z,-edge,edge)};
   }
   pointClear(p){
     const limit=this.halfSize-this.radius-.05;
     return Math.abs(p.x)<=limit&&Math.abs(p.z)<=limit&&!this.obstacles.some(b=>pointInside(b,p.x,p.z,this.radius));
   }
   segmentClear(from,to){
     if(!this.pointClear(from)||!this.pointClear(to))return false;
     return !this.obstacles.some(b=>segmentHitsBox(from,to,b,this.radius));
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
     // Treat cell squares as blocked when they intersect a padded building.
     const x=-this.halfSize+c.x*this.cellSize,z=-this.halfSize+c.z*this.cellSize;
     const pad=this.radius+.04;
     return this.obstacles.some(b=>x<=b.maxX+pad&&x+this.cellSize>=b.minX-pad&&
       z<=b.maxZ+pad&&z+this.cellSize>=b.minZ-pad);
   }
   findSafeGoal(request){
     const goal=this.clamp(request),raw=this.cell(goal);
     if(this.pointClear(goal)&&!this.cellBlocked(raw))return goal;
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
     const cells=this.findPath(from,goal);if(!cells)return null;
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
 return {Navigator,pointInside,segmentHitsBox};
});
