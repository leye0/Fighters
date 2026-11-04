/* Fighters RTS — pure food economy, three growth stages, no 3D allocations. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersFarming=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const SPECIES=Object.freeze(['tomato','potato','carrot','wheat']);
  const FIRST_STAGE=1,LAST_STAGE=3;
  const GROWTH_SECONDS=12,HARVEST_SECONDS=1.6,FOOD_PER_HARVEST=8;
  const FOOD_PER_WITCH_SECOND=.06,STARTING_FOOD=45,STARVATION_DAMAGE=2.5;
  const PLOT_SPECIES=Object.freeze([0,1,2,3,0,1]);
  class Economy{
    constructor(){this.reset();}
    reset(){
      this.food=STARTING_FOOD;this.gardens=new Map();
      this.harvests=0;this.producedFood=0;this.starvationSeconds=0;
    }
    addGarden(id){
      if(!id||this.gardens.has(id))return false;
      this.gardens.set(id,{id,plots:PLOT_SPECIES.map(species=>({
        species,stage:FIRST_STAGE,elapsed:0
      }))});
      return true;
    }
    removeGarden(id){return this.gardens.delete(id);}
    garden(id){return this.gardens.get(id)||null;}
    firstReady(id,reserved=[]){
      const garden=this.garden(id);
      if(!garden)return -1;
      return garden.plots.findIndex((plot,i)=>plot.stage===LAST_STAGE&&!reserved.includes(i));
    }
    harvest(id,index){
      const plot=this.garden(id)?.plots[index];
      if(!plot||plot.stage!==LAST_STAGE)return 0;
      plot.stage=FIRST_STAGE;plot.elapsed=0;
      this.harvests++;this.producedFood+=FOOD_PER_HARVEST;
      this.food+=FOOD_PER_HARVEST;return FOOD_PER_HARVEST;
    }
    step(dt,witchCount){
      if(!Number.isFinite(dt)||dt<0||!Number.isFinite(witchCount)||witchCount<0)
        throw Error('Invalid farming time or population');
      for(const garden of this.gardens.values())for(const plot of garden.plots){
        if(plot.stage===LAST_STAGE)continue;
        plot.elapsed+=dt;
        while(plot.stage<LAST_STAGE&&plot.elapsed>=GROWTH_SECONDS){
          plot.elapsed-=GROWTH_SECONDS;plot.stage++;
        }
        if(plot.stage===LAST_STAGE)plot.elapsed=0;
      }
      const rate=witchCount*FOOD_PER_WITCH_SECOND;
      const demand=rate*dt,eaten=Math.min(this.food,demand);
      this.food=Math.max(0,this.food-eaten);
      const starvedSeconds=rate>0?(demand-eaten)/rate:0;
      this.starvationSeconds+=starvedSeconds;
      return {starvedSeconds,eaten};
    }
    snapshot(){
      return {food:this.food,harvests:this.harvests,producedFood:this.producedFood,
        starvationSeconds:this.starvationSeconds,
        gardens:[...this.gardens.values()].map(g=>({id:g.id,
          stages:g.plots.map(p=>p.stage),species:g.plots.map(p=>SPECIES[p.species])}))};
    }
  }
  return Object.freeze({Economy,SPECIES,FIRST_STAGE,LAST_STAGE,
    GROWTH_SECONDS,HARVEST_SECONDS,FOOD_PER_HARVEST,FOOD_PER_WITCH_SECOND,
    STARTING_FOOD,STARVATION_DAMAGE});
});