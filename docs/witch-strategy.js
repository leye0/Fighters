/* Orks & Sorcières — deterministic witch settlement and battle director.
 * The simulation supplies only locally discovered enemies and buildings;
 * this module never reads Three.js, DOM state or the opposing fog grid.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersWitchStrategy=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const COST=Object.freeze({'witch-house':230,garden:175,'stone-circle':260});
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 function center(building){
  return building.hitbox?{x:(building.hitbox.minX+building.hitbox.maxX)/2,
   z:(building.hitbox.minZ+building.hitbox.maxZ)/2}:building;
 }
 function defendersNear(witches,position,radius=18){
  return witches.filter(u=>!u.dead&&u.role!=='worker'&&
   distance(u,position)<=radius).map(u=>u.id);
 }
 function planSite(type,buildings,valid){
  if(!COST[type]||typeof valid!=='function')return null;
  const occupied=buildings.filter(b=>!b.destroyed).map(b=>({...center(b),type:b.type}));
  const sites=[];
  for(let z=-23;z<=19;z+=3.8)for(let x=-24;x<=-4;x+=3.8){
   const p={x:Math.round(x*10)/10,z:Math.round((z+((Math.floor(-x/3.8)%2)*1.3))*10)/10};
   if(!valid(p.x,p.z,type))continue;
   const nearest=occupied.reduce((best,b)=>Math.min(best,distance(p,b)),20);
   const cluster=occupied.filter(b=>distance(p,b)<11).length;
   const gardenBonus=type==='garden'?distance(p,{x:-16,z:-16})*.5:0;
   const score=Math.abs(nearest-7)*1.6+(cluster===0?12:cluster===1?0:cluster*1.5)+
     distance(p,{x:-17,z:-15})*.23+gardenBonus;
   sites.push({...p,score});
  }
  sites.sort((a,b)=>a.score-b.score||a.z-b.z||a.x-b.x);
  return sites[0]?{x:sites[0].x,z:sites[0].z}:null;
 }
 class Director{
  constructor(options={}){this.enabled=options.enabled!==false;this.reset();}
  reset(){
   this.clock=0;this.cooldown=0;this.tickCount=0;this.mode='develop';
   this.lastThreat=-100;this.lastRaid=-100;this.raids=0;this.history=[];
  }
  snapshot(){return {enabled:this.enabled,clock:this.clock,mode:this.mode,
   raids:this.raids,decisions:this.history.slice(-12)};}
  decide(state,valid){
   if(!this.enabled||!state.ready||!state.running||state.paused)return [];
   const own=state.witches.filter(u=>!u.dead);
   const workers=own.filter(u=>u.role==='worker');
   const fighters=own.filter(u=>u.role!=='worker');
   const buildings=state.buildings.filter(b=>!b.destroyed);
   const houses=buildings.filter(b=>b.type==='witch-house');
   const gardens=buildings.filter(b=>b.type==='garden');
   const circles=buildings.filter(b=>b.type==='stone-circle');
   const pending=state.pendingBuilds||[];
   const home=houses.find(b=>b.id===state.homeId)||houses[0];
   const enemies=state.orcs.filter(u=>!u.dead);
   // An attack against a patrol or worker is also an attack on the village;
   // waiting for raiders to reach a building left outlying witches undefended.
   const attackers=enemies.filter(u=>buildings.some(b=>distance(u,center(b))<13)||
     own.some(w=>distance(u,w)<7));
   const threatened=attackers.length>0;
   if(threatened)this.lastThreat=this.clock;
   this.mode=threatened?'defend':this.clock-this.lastThreat<10?'recover':
     state.enemyTarget?'develop':'explore';
   const actions=[];
   if(threatened&&fighters.length)actions.push({type:'defend',
    x:attackers[0].x,z:attackers[0].z,reason:'settlement_threatened'});
   const canBuy=(gold,wood=0,reserve=0)=>state.gold>=gold+reserve&&state.wood>=wood;
   const canTrain=home&&home.queue.length<2&&own.length<(state.unitCap||16);
   const workerCount=workers.length;
   // Only an actual worker can construct, cut timber or mine; restore that
   // capacity first, even during a famine or an attack.
   if(canTrain&&workerCount<2&&canBuy(75))actions.push({type:'train',
    buildingId:home.id,role:'worker',reason:'restore_economy'});
   if(workerCount&&gardens.length+pending.filter(b=>b.type==='garden').length<
     (state.food<18?2:1)&&
     canBuy(COST.garden,0,80)){
    const site=planSite('garden',buildings,valid);
    if(site)actions.push({type:'build',building:'garden',...site,reason:'food_security'});
   }
   if(home&&home.level<2&&this.clock>12&&canBuy(330,40,150)&&
     !home.queue.some(o=>o.kind==='upgrade'))actions.push({type:'upgrade',
     buildingId:home.id,reason:'unlock_sanctuary'});
   if(home&&home.level===2&&this.clock>75&&canBuy(430,40,100)&&
     !home.queue.some(o=>o.kind==='upgrade'))actions.push({type:'upgrade',
     buildingId:home.id,reason:'unlock_defensive_dome'});
   if(workerCount&&state.circleUnlocked&&circles.length===0&&
     !pending.some(b=>b.type==='stone-circle')&&
     canBuy(COST['stone-circle'],85,100)){
    const site=planSite('stone-circle',buildings,valid);
    if(site)actions.push({type:'build',building:'stone-circle',...site,
     reason:'unlock_arcanists_and_healing'});
   }
   if(home&&workerCount&&houses.length<2&&!pending.some(b=>b.type==='witch-house')&&this.clock>65&&
     canBuy(COST['witch-house'],75,230)){
    const site=planSite('witch-house',buildings,valid);
    if(site)actions.push({type:'build',building:'witch-house',...site,
     reason:'expand_recruitment'});
   }
   if(canTrain&&workerCount>=2&&canBuy(120,0,80)){
    const ranged=state.arcanistUnlocked&&fighters.filter(u=>u.role==='ranged').length<
      Math.max(2,Math.floor(fighters.length/2));
    actions.push({type:'train',buildingId:home.id,role:ranged&&canBuy(150,0,80)?
      'ranged':'melee',reason:threatened?'defend':'raise_army'});
   }
   for(const building of buildings){
    if(!workerCount||!building.maxHealth||building.health>=building.maxHealth*.68)continue;
    if(workers.some(u=>u.repairing))break;
    actions.push({type:'repair',buildingId:building.id,reason:'damaged_building'});break;
   }
   if(!threatened&&!state.enemyTarget&&this.clock>7&&state.scoutTarget){
    const scout=fighters.find(u=>u.scouting&&!u.destination&&!u.attackOrder)||
      fighters.find(u=>!u.destination&&!u.attackOrder&&!u.healing);
    if(scout)actions.push({type:'scout',unitId:scout.id,
     x:state.scoutTarget.x,z:state.scoutTarget.z,reason:'unexplored_frontier'});
   }
   const available=fighters.filter(u=>!u.attackOrder&&!u.destination&&!u.healing);
   if(state.enemyTarget&&!threatened&&this.clock>25&&available.length>=4&&
     this.clock-this.lastRaid>24){
    actions.push({type:'raid',targetId:state.enemyTarget.id,
     unitIds:available.slice(0,Math.min(8,available.length)).map(u=>u.id),
     reason:'discovered_target'});
   }
   return actions;
  }
  update(dt,state,valid){
   if(!this.enabled||!state.running||state.paused)return [];
   this.clock+=dt;this.cooldown-=dt;
   if(this.cooldown>0)return [];
   this.cooldown=2.5;this.tickCount++;
   const wanted=this.decide(state,valid);
   const economic=wanted.filter(a=>['train','build','upgrade'].includes(a.type));
   const tactical=wanted.filter(a=>!['train','build','upgrade'].includes(a.type));
   const garden=economic.find(a=>a.reason==='food_security');
   const worker=economic.find(a=>a.reason==='restore_economy');
   const circle=economic.find(a=>a.building==='stone-circle');
   const upgrade=economic.find(a=>a.type==='upgrade');
   const house=economic.find(a=>a.building==='witch-house');
   const train=economic.find(a=>a.type==='train');
   const choice=worker||garden||circle||
     (upgrade&&this.tickCount%3===0?upgrade:null)||
     (house&&this.tickCount%4===0?house:null)||train||upgrade||house;
   const actions=choice?[...tactical,choice]:tactical;
   for(const action of actions){
    if(action.type==='raid'){
     this.raids++;this.lastRaid=this.clock;this.mode='attack';
    }
    this.history.push({t:Math.round(this.clock*10)/10,...action});
   }
   if(this.history.length>80)this.history.splice(0,this.history.length-80);
   return actions;
  }
 }
 return {Director,planSite,defendersNear,COST};
});
