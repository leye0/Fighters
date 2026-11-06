/* Fighters RTS — screen-space selection of units, wildlife and buildings. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersPicking=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  // Rendering and game-state reads are injected so picking can be tested without
  // a browser, and input controllers never need to know projected hit geometry.
  function create({viewport,project,units,ravens,ravensReady,trees,woodDeposits,
    buildings,activeFaction,visible,inside,clamp}){
    const rect=()=>viewport.getBoundingClientRect();
    const compact=()=>viewport.clientWidth<760;
    const screen=(point,bounds)=>({
      x:bounds.left+(point.x+1)*bounds.width/2,
      y:bounds.top+(1-point.y)*bounds.height/2
    });

    function unit(x,y,includeEnemies=false){
      let found=null,best=Infinity;
      const radius=compact()?41:30;
      const bounds=rect(),faction=activeFaction();
      for(const actor of units()){
        // Friendly silhouettes remain selectable between fog-grid updates.
        if(actor.dead||(!includeEnemies&&actor.kind!==faction)||
          (actor.kind!==faction&&!visible(actor.root.position.x,actor.root.position.z)))continue;
        const world=actor.root.position;
        const base=screen(project(world.x,.05,world.z),bounds);
        const top=screen(project(world.x,2.45,world.z),bounds);
        const vx=top.x-base.x,vy=top.y-base.y,lengthSq=vx*vx+vy*vy;
        const t=lengthSq?clamp(((x-base.x)*vx+(y-base.y)*vy)/lengthSq,0,1):0;
        const d=Math.hypot(x-(base.x+vx*t),y-(base.y+vy*t));
        if(d<radius&&d<best){found=actor;best=d;}
      }
      return found;
    }

    function raven(x,y){
      if(activeFaction()!=='witch'||!ravensReady())return null;
      const bounds=rect();
      let chosen=null,best=compact()?37:25;
      for(const bird of ravens()){
        if(!visible(bird.x,bird.z))continue;
        const p=project(bird.x,bird.y+.33,bird.z);
        if(p.z< -1||p.z>1)continue;
        const px=bounds.left+(p.x+1)*bounds.width/2;
        const py=bounds.top+(1-p.y)*bounds.height/2;
        const distance=Math.hypot(x-px,y-py);
        if(distance<best){chosen=bird;best=distance;}
      }
      return chosen;
    }

    function building(groundPoint){
      // Only the GLB X/Z footprint is interactive, never the roof/AABB.
      if(!groundPoint||!visible(groundPoint.x,groundPoint.z))return null;
      return buildings().find(item=>item.root?.visible&&item.hitbox&&
        inside(groundPoint,item.hitbox))||null;
    }

    function tree(x,y){
      const bounds=rect();
      const radius=compact()?28:20;
      let chosen=null,best=radius;
      const all=trees();
      for(let i=0;i<all.length;i++){
        const item=all[i];
        if(item.felled||!visible(item.x,item.z))continue;
        const base=screen(project(item.x,.12,item.z),bounds);
        const top=screen(project(item.x,item.height*.75,item.z),bounds);
        const dx=top.x-base.x,dy=top.y-base.y,span=dx*dx+dy*dy;
        const t=span?clamp(((x-base.x)*dx+(y-base.y)*dy)/span,0,1):0;
        const distance=Math.hypot(x-(base.x+t*dx),y-(base.y+t*dy));
        if(distance<best){chosen=i;best=distance;}
      }
      return chosen;
    }

    function logBundle(x,y){
      const bounds=rect();
      const radius=compact()?29:22;
      let chosen=null,best=radius;
      const all=trees();
      for(const index of woodDeposits().keys()){
        const item=all[index];
        if(!visible(item.x,item.z))continue;
        const p=project(item.x,.24,item.z);
        const sx=bounds.left+(p.x+1)*bounds.width/2;
        const sy=bounds.top+(1-p.y)*bounds.height/2;
        const distance=Math.hypot(x-sx,y-sy);
        if(distance<best){chosen=index;best=distance;}
      }
      return chosen;
    }

    return Object.freeze({unit,raven,building,tree,logBundle});
  }
  return Object.freeze({create});
});
