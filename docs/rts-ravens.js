/* Witch ravens: small, deterministic airborne scouts and untouchable decoys.
 * Their flight and tree-perching state is independent of Three.js and of the
 * ground-unit navigation, combat and population systems.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersRavens=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  // Halve the explored surface of a flying raven (area scales with r²).
  const SCOUT_SIGHT=2.2;
  class Flock{
    constructor(trees,{count=2,halfSize=28,clampPosition=null}={}){
      this.trees=trees;this.count=count;this.halfSize=halfSize;
      this.clampPosition=clampPosition;
      this.reset();
    }
    random(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296;}
    reset(){
      this.seed=0xc0a71e;this.elapsed=0;
      const witchTrees=this.trees.map((tree,index)=>({...tree,index}))
        .filter(tree=>!tree.felled&&tree.x< -9&&tree.z< -5);
      const starting=witchTrees.length?witchTrees:
        this.trees.map((tree,index)=>({...tree,index})).filter(tree=>!tree.felled);
      this.ravens=Array.from({length:Math.min(this.count,starting.length)},(_,i)=>{
        const tree=starting[i%starting.length];
        return {id:'raven-'+(i+1),x:tree.x,y:tree.height+.06,z:tree.z,
          heading:i*Math.PI/2,treeIndex:tree.index,mode:'perched',
          timer:2.8+i*2.2,flight:null,scoutCenter:null,scoutSteps:0};
      });
    }
    livingTrees(exclude=-1,avoid=null){
      return this.trees.map((tree,index)=>({...tree,index})).filter(tree=>
        !tree.felled&&tree.index!==exclude&&(!avoid||distance(tree,avoid)>3.5));
    }
    choosePerch(raven,avoid=null){
      const trees=this.livingTrees(raven.treeIndex,avoid);
      if(!trees.length)return null;
      // Most journeys are local hops; occasional longer flights feel natural.
      const nearby=trees.filter(t=>distance(t,raven)>3&&distance(t,raven)<17);
      const pool=nearby.length?nearby:trees;
      return pool[Math.floor(this.random()*pool.length)];
    }
    takeFlight(raven,goal,arrival='perched',treeIndex=null){
      const point=this.clampPosition?this.clampPosition(goal.x,goal.z,1):
        {x:clamp(goal.x,-this.halfSize+1,this.halfSize-1),
          z:clamp(goal.z,-this.halfSize+1,this.halfSize-1)};
      const to={...point,y:goal.y};
      raven.flight={from:{x:raven.x,y:raven.y,z:raven.z},to,
        duration:Math.max(.75,distance(raven,to)/5.8),elapsed:0,arrival,treeIndex};
      raven.mode='flying';raven.treeIndex=null;
      raven.heading=Math.atan2(to.x-raven.x,to.z-raven.z);
    }
    flyToPerch(raven,avoid=null){
      const tree=this.choosePerch(raven,avoid);
      if(tree){this.takeFlight(raven,{x:tree.x,z:tree.z,y:tree.height+.06},
        'perched',tree.index);return;}
      // All trees may have been harvested: circle above the remaining forest.
      this.takeFlight(raven,{x:raven.x+2,z:raven.z+2,y:6.2},'airborne');
    }
    orderMove(id,destination){
      const raven=this.ravens.find(raven=>raven.id===id);
      if(!raven)return null;
      raven.scoutCenter=this.clampPosition?this.clampPosition(destination.x,destination.z,2):
        {x:clamp(destination.x,-this.halfSize+2,this.halfSize-2),
          z:clamp(destination.z,-this.halfSize+2,this.halfSize-2)};
      raven.scoutSteps=4;
      this.takeFlight(raven,{...raven.scoutCenter,y:6.4},'scout');
      return raven;
    }
    update(dt,orcs=[]){
      this.elapsed+=dt;
      for(const raven of this.ravens){
        if(raven.mode==='perched'){
          const tree=this.trees[raven.treeIndex];
          const danger=orcs.find(orc=>!orc.dead&&distance(orc,raven)<3.1);
          if(tree?.felled||danger){
            raven.scoutCenter=null;raven.scoutSteps=0;
            this.flyToPerch(raven,danger);continue;
          }
          raven.timer-=dt;
          if(raven.timer<=0)this.flyToPerch(raven);
          continue;
        }
        const flight=raven.flight;
        if(!flight)continue;
        flight.elapsed+=dt;
        const t=clamp(flight.elapsed/flight.duration,0,1);
        const eased=t*t*(3-2*t);
        raven.x=flight.from.x+(flight.to.x-flight.from.x)*eased;
        raven.z=flight.from.z+(flight.to.z-flight.from.z)*eased;
        raven.y=flight.from.y+(flight.to.y-flight.from.y)*eased+
          Math.sin(Math.PI*t)*Math.min(2.1,.75+flight.duration*.35);
        if(t<1)continue;
        raven.flight=null;
        if(flight.arrival==='scout'&&raven.scoutSteps>0){
          raven.scoutSteps--;
          const angle=this.random()*Math.PI*2,radius=2.1+this.random()*2.3;
          this.takeFlight(raven,{x:raven.scoutCenter.x+Math.cos(angle)*radius,
            z:raven.scoutCenter.z+Math.sin(angle)*radius,y:6+this.random()*1.5},'scout');
        }else if(flight.arrival==='perched'&&!this.trees[flight.treeIndex]?.felled){
          raven.treeIndex=flight.treeIndex;raven.mode='perched';
          raven.timer=3.2+this.random()*7;
          raven.scoutCenter=null;raven.scoutSteps=0;
        }else{
          raven.scoutCenter=null;raven.scoutSteps=0;
          this.flyToPerch(raven);
        }
      }
    }
    visionSources(){
      return this.ravens.map(raven=>({x:raven.x,z:raven.z,
        radius:raven.mode==='flying'?SCOUT_SIGHT:1.6}));
    }
    nearestDecoy(position,maxDistance=7){
      let target=null,best=maxDistance;
      for(const raven of this.ravens){
        const d=distance(position,raven);
        if(d<best){target=raven;best=d;}
      }
      return target;
    }
  }
  return {Flock,SCOUT_SIGHT};
});
