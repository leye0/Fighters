/* Fighters RTS — orc sustenance and freely roaming, renewable wild hares.
 * No Three.js dependency: food, respawning and movement are testable in Node.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersOrcFood=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const HARE_COUNT=16,HARE_FOOD=9,CORPSE_FOOD=42;
  const FOOD_PER_ORC_SECOND=.027,STARTING_FOOD=45,STARVATION_DAMAGE=2.3;
  const HUNT_SIGHT=10,EAT_SECONDS=1.6,RESPAWN_SECONDS=48;
  const BASE_HOUSING=4,HUT_CAPACITY=Object.freeze([0,6,10,14]);
  const MAX_POPULATION=32;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

  function housingCap(buildings){
    return Math.min(MAX_POPULATION,BASE_HOUSING+buildings.reduce((cap,b)=>
      cap+(b.type==='hut'&&b.clanId==='orcs'&&!b.destroyed?
        (HUT_CAPACITY[b.level]||0):0),0));
  }
  function hasCauldron(buildings){
    return buildings.some(b=>b.type==='cauldron'&&b.clanId==='orcs'&&!b.destroyed);
  }

  class Economy{
    constructor(){this.reset();}
    reset(){
      this.food=STARTING_FOOD;this.haresEaten=0;this.corpsesEaten=0;
      this.starvationSeconds=0;this.consumedCorpses=new Set();
    }
    step(dt,population){
      if(!Number.isFinite(dt)||dt<0||!Number.isFinite(population)||population<0)
        throw Error('Invalid orc food time or population');
      const rate=FOOD_PER_ORC_SECOND*population,needed=rate*dt;
      const consumed=Math.min(needed,this.food);
      this.food=Math.max(0,this.food-consumed);
      const starvedSeconds=rate>0?(needed-consumed)/rate:0;
      this.starvationSeconds+=starvedSeconds;
      return {consumed,starvedSeconds};
    }
    eatHare(){this.food+=HARE_FOOD;this.haresEaten++;return HARE_FOOD;}
    eatCorpse(id){
      if(id==null||this.consumedCorpses.has(id))return 0;
      this.consumedCorpses.add(id);this.corpsesEaten++;
      this.food+=CORPSE_FOOD;return CORPSE_FOOD;
    }
    snapshot(){return {food:this.food,haresEaten:this.haresEaten,
      corpsesEaten:this.corpsesEaten,starvationSeconds:this.starvationSeconds};}
  }

  class Hares{
    constructor({count=HARE_COUNT,halfSize=28,walkable=()=>true}={}){
      this.count=count;this.halfSize=halfSize;this.walkable=walkable;this.reset();
    }
    random(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296;}
    spawn(){
      // Avoid starting on the two headquarters, while using the whole forest.
      for(let i=0;i<140;i++){
        const p={x:(this.random()*2-1)*(this.halfSize-2),
          z:(this.random()*2-1)*(this.halfSize-2)};
        if(distance(p,{x:-22,z:-18})<6||distance(p,{x:19,z:18})<6)continue;
        if(this.walkable(p.x,p.z))return p;
      }
      return {x:0,z:0};
    }
    reset(){
      this.seed=0x63e25a17;this.elapsed=0;
      this.hares=Array.from({length:this.count},(_,id)=>({
        id,...this.spawn(),active:true,heading:this.random()*Math.PI*2,
        turnIn:.5+this.random()*3,hopPhase:this.random()*Math.PI*2,
        moving:false,respawnIn:0,caughtBy:null
      }));
    }
    catch(id,orcId){
      const hare=this.hares[id];
      if(!hare?.active||hare.caughtBy!=null||orcId==null)return false;
      hare.caughtBy=orcId;hare.moving=false;return true;
    }
    release(id,orcId){
      const hare=this.hares[id];
      if(hare?.caughtBy===orcId){hare.caughtBy=null;return true;}
      return false;
    }
    eat(id){
      const hare=this.hares[id];
      if(!hare?.active)return false;
      hare.active=false;hare.moving=false;hare.caughtBy=null;
      hare.respawnIn=RESPAWN_SECONDS+this.random()*15;
      return true;
    }
    step(dt,orcs=[]){
      if(!Number.isFinite(dt)||dt<0)throw Error('Invalid hare time');
      this.elapsed+=dt;
      for(const hare of this.hares){
        if(!hare.active){
          hare.respawnIn-=dt;
          if(hare.respawnIn<=0){
            const p=this.spawn();hare.x=p.x;hare.z=p.z;
            hare.active=true;hare.turnIn=0;hare.respawnIn=0;
          }
          continue;
        }
        // A caught hare stays put while the orc completes the eating action.
        if(hare.caughtBy!=null){hare.moving=false;continue;}
        hare.turnIn-=dt;
        let danger=null,closest=4;
        for(const orc of orcs){
          const d=distance(hare,orc);
          if(d<closest){danger=orc;closest=d;}
        }
        if(danger){
          hare.heading=Math.atan2(hare.x-danger.x,hare.z-danger.z);
          hare.turnIn=.3;
        }else if(hare.turnIn<=0){
          hare.heading+=((this.random()*2)-1)*2.7;
          hare.turnIn=1.1+this.random()*3.8;
        }
        const speed=danger?2.05:.7;
        const x=hare.x+Math.sin(hare.heading)*speed*dt;
        const z=hare.z+Math.cos(hare.heading)*speed*dt;
        if(Math.abs(x)>this.halfSize-1.3||Math.abs(z)>this.halfSize-1.3||
          !this.walkable(x,z)){
          hare.heading+=Math.PI*(.6+this.random()*.8);
          hare.turnIn=.4;hare.moving=false;
        }else{
          hare.x=x;hare.z=z;hare.moving=true;
          hare.hopPhase+=dt*(danger?17:10);
        }
      }
    }
  }
  return Object.freeze({Economy,Hares,housingCap,hasCauldron,HARE_COUNT,
    HARE_FOOD,CORPSE_FOOD,FOOD_PER_ORC_SECOND,STARTING_FOOD,STARVATION_DAMAGE,
    HUNT_SIGHT,EAT_SECONDS,RESPAWN_SECONDS,BASE_HOUSING,HUT_CAPACITY,
    MAX_POPULATION});
});
