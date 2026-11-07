/* Fighters RTS — walkable, wild berry shrubs, independent of garden plots.
 * Data and placement only: no Three.js objects are allocated per tick.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersBerries=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const FIRST_STAGE=1,LAST_STAGE=3,GROWTH_SECONDS=15;
  const EAT_SECONDS=1.6,FOOD_PER_BUSH=3,BUSH_COUNT=28,FORAGE_SIGHT=3;
  const RESERVED=[[-23.5,-17.5,6.8],[22,20,8.0],[15,20,5.5],
    [-12,-21,4.6],[-35,-26,4.6],[32,31,4.6],[8,-10,4.5],[1,26,4.5]];
  const STARTING_SHRUBS=[[-18,-9.5],[-21,-10.5]];
  function createLayout(trees=[],seed=0x4ba9a123,map=null){
    let state=seed>>>0;
    const random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};
    const bushes=[];
    function add(x,z){
      if((map?!map.contains(x,z,1):Math.abs(x)>25||Math.abs(z)>25)||
        RESERVED.some(([rx,rz,r])=>Math.hypot(x-rx,z-rz)<r)||
        trees.some(t=>Math.hypot(x-t.x,z-t.z)<1.55)||
        bushes.some(b=>Math.hypot(x-b.x,z-b.z)<2.35)||
        [[-18,-13],[-16.5,-15],[-19,-16],[15,17],[21,17],[19,23],[12,22]]
          .some(([ux,uz])=>Math.hypot(x-ux,z-uz)<1.15))return false;
      bushes.push({id:bushes.length,x,z,angle:random()*Math.PI*2,
        scale:.48+random()*.15,stage:FIRST_STAGE,elapsed:random()*GROWTH_SECONDS*.6});
      return true;
    }
    for(const [x,z] of STARTING_SHRUBS)add(x,z);
    for(let trial=0;trial<BUSH_COUNT*110&&bushes.length<BUSH_COUNT;trial++){
      const candidate=map?map.toWorld((random()*2-1)*(map.HALF-1.6),
        (random()*2-1)*(map.HALF-1.6)):
        {x:-24+random()*48,z:-24+random()*48};
      const {x,z}=candidate;
      add(x,z);
    }
    return bushes;
  }
  class WildBerries{
    constructor(trees=[],{map=null}={}){this.bushes=createLayout(trees,0x4ba9a123,map);this.reset();}
    reset(){
      this.eaten=0;this.producedFood=0;
      for(const bush of this.bushes){bush.stage=FIRST_STAGE;bush.elapsed=0;}
    }
    step(dt){
      if(!Number.isFinite(dt)||dt<0)throw Error('Invalid wild berry time');
      for(const bush of this.bushes){
        if(bush.stage===LAST_STAGE)continue;
        bush.elapsed+=dt;
        while(bush.stage<LAST_STAGE&&bush.elapsed>=GROWTH_SECONDS){
          bush.elapsed-=GROWTH_SECONDS;bush.stage++;
        }
        if(bush.stage===LAST_STAGE)bush.elapsed=0;
      }
    }
    eat(index){
      const bush=this.bushes[index];
      if(!bush||bush.stage!==LAST_STAGE)return 0;
      bush.stage=FIRST_STAGE;bush.elapsed=0;
      this.eaten++;this.producedFood+=FOOD_PER_BUSH;
      return FOOD_PER_BUSH;
    }
    snapshot(){return {count:this.bushes.length,eaten:this.eaten,
      producedFood:this.producedFood,stages:this.bushes.map(b=>b.stage)};}
  }
  return Object.freeze({WildBerries,createLayout,FIRST_STAGE,LAST_STAGE,
    GROWTH_SECONDS,EAT_SECONDS,FOOD_PER_BUSH,BUSH_COUNT,FORAGE_SIGHT});
});
