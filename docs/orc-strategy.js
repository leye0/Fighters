/* Fighters — deterministic, budget-aware orc RTS director.
 * Separates economic/settlement decisions from animation and Three.js.
 * A layout planner scores build sites by access, spacing, and functional district.
 * UMD API for Node regression tests and browser runtime.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersOrcStrategy=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const TYPES=['barrack','hut','mine','cauldron','factory'];
 const COST={barrack:180,hut:120,mine:140,cauldron:200,factory:250};
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const near=(a,b,r)=>dist(a,b)<=r;
 function boxCentre(b){
  if(b.hitbox)return{x:(b.hitbox.minX+b.hitbox.maxX)/2,z:(b.hitbox.minZ+b.hitbox.maxZ)/2};
  return{x:b.x,z:b.z};
 }
 function planSite(type,buildings,valid,options={}){
  if(!TYPES.includes(type)||typeof valid!=='function')return null;
  const center=options.center||{x:19,z:18};
  const last=buildings.filter(b=>!b.destroyed).map(b=>({...boxCentre(b),type:b.type}));
  const found=[];
  // Two irregularly staggered grids allow organic clusters with navigable gaps.
  // Keep a wide central lane north/south for military units and avoid perimeter.
  for(let z=5;z<=24;z+=4.7)for(let x=4;x<=25;x+=4.7){
   for(const shift of [0,1.55]){
    const p={x:Math.round((x+((Math.floor(z/4.7)%2)*1.4)+shift)*10)/10,
             z:Math.round((z+shift*.55)*10)/10};
    if(p.x>25.4||p.z>25.4||!valid(p.x,p.z,type))continue;
    const neighbours=last.map(b=>({d:dist(p,b),type:b.type})).sort((a,b)=>a.d-b.d);
    const closest=neighbours[0]?.d??10;
    // Maintain navigable paths and avoid an arbitrarily dense maze.
    const spacing=Math.abs(closest-6.8)*1.25;
    const hub=dist(p,center);
    const district=type==='mine'?-hub*.35:type==='barrack'?hub*.28:hub*.18;
    const synergy=neighbours.some(n=>n.type===type&&n.d<7)?4:0;
    const cluster=last.filter(b=>dist(p,b)<11).length;
    const isolate=cluster===0?8:cluster===1?2:0;
    const entrance=Math.abs(p.x-p.z)<3&&p.x>7&&p.x<17?5:0;
    const score=spacing+district+synergy+isolate+entrance;
    found.push({type,x:p.x,z:p.z,score});
   }
  }
  found.sort((a,b)=>a.score-b.score||a.x-b.x||a.z-b.z);
  return found[0]||null;
 }
 class Director{
  constructor(options={}){
   this.clock=0;this.cooldown=0;this.lastRaid=-100;this.raidNumber=0;
   this.mode='develop';this.history=[];this.enabled=options.enabled!==false;
   this.lastThreat=-100;this.upgradeAt=options.upgradeAt??35;
   this.tickCount=0;
  }
  reset(){
   this.clock=0;this.cooldown=0;this.lastRaid=-100;this.raidNumber=0;
   this.mode='develop';this.history=[];this.lastThreat=-100;this.tickCount=0;
  }
  snapshot(){
   return {clock:this.clock,mode:this.mode,raids:this.raidNumber,
    decisions:this.history.slice(-12),enabled:this.enabled};
  }
  decide(state,valid){
   if(!this.enabled||!state.ready||!state.running||state.paused)return [];
   const buildings=state.buildings.filter(b=>!b.destroyed);
   const own=state.orcs.filter(u=>!u.dead),enemy=state.witches.filter(u=>!u.dead);
   const barrack=buildings.find(b=>b.type==='barrack');
   const mines=buildings.filter(b=>b.type==='mine');
   const base={x:19,z:18};
   const attackers=enemy.filter(u=>near(u,base,16)||buildings.some(b=>near(u,boxCentre(b),6.5)));
   const threatened=attackers.length>0;
   if(threatened){this.lastThreat=this.clock;this.mode='defend';}
   else this.mode=this.clock-this.lastThreat<10?'recover':'develop';
   const orders=[];
   const canSpend=(cost,reserve=0)=>state.gold>=cost+reserve;
   const queueLength=b=>b?.queue?.length||0;
   // Tactical defense takes priority over an offensive raid.
   if(threatened&&own.length){
    orders.push({type:'defend',x:attackers[0].x,z:attackers[0].z,reason:'enemy_at_base'});
   }
   // Recover a destroyed barrack before trying to train.
   if(!barrack&&canSpend(COST.barrack,40)){
    const site=planSite('barrack',buildings,valid);
    if(site)orders.push({type:'build',building:'barrack',x:site.x,z:site.z,reason:'restore_recruitment'});
   }
   const cap=state.unitCap||15;
   // Keep a defensive reserve while building an attacking group.
   if(barrack&&own.length<cap&&queueLength(barrack)<2&&canSpend(100,
       this.clock<30?100:30)){
    orders.push({type:'train',buildingId:barrack.id,reason:own.length<6?'reinforce':'prepare_raid'});
   }
   // Mine income funds sustained autonomous expansion.
   if(mines.length<2&&canSpend(COST.mine,110)&&this.clock>8){
    const site=planSite('mine',buildings,valid);
    if(site)orders.push({type:'build',building:'mine',x:site.x,z:site.z,reason:'income'});
   }
   const wishlist=['hut','barrack','cauldron','factory','hut','mine'];
   const desired={hut:2,barrack:2,cauldron:2,factory:2,mine:3};
   if(this.clock>18&&buildings.length<12){
    for(const type of wishlist){
     if(buildings.filter(b=>b.type===type).length>=desired[type])continue;
     if(!canSpend(COST[type],type==='barrack'?100:160))continue;
     const site=planSite(type,buildings,valid);
     if(site){orders.push({type:'build',building:type,x:site.x,z:site.z,reason:'planned_district'});break;}
    }
   }
   // Upgrade sustainably once a settlement is established.
   if(this.clock>this.upgradeAt&&canSpend(270,170)){
    const target=buildings.filter(b=>b.level<3&&!b.queue.some(o=>o.kind==='upgrade'))
      .sort((a,b)=>{
       const priorities={barrack:0,mine:1,hut:2,factory:3,cauldron:4};
       return(a.level-b.level)||priorities[a.type]-priorities[b.type];
      })[0];
    if(target)orders.push({type:'upgrade',buildingId:target.id,reason:'development'});
   }
   // Fire a raid only with a real group; do not feed troops one at a time.
   const unassigned=own.filter(u=>!u.attackOrder&&!(u.attack?.target));
   const threshold=this.raidNumber===0?4:5;
   if(!threatened&&this.clock>20&&unassigned.length>=threshold&&this.clock-this.lastRaid>22){
    const squad=unassigned.sort((a,b)=>(a.health/a.maxHealth)-(b.health/b.maxHealth))
      .slice(-Math.min(7,unassigned.length));
    orders.push({type:'raid',unitIds:squad.map(u=>u.id),reason:'squad_ready'});
    this.lastRaid=this.clock;this.raidNumber++;this.mode='attack';
   }
   return orders;
  }
  update(dt,state,valid){
   if(!this.enabled||!state.running||state.paused)return [];
   this.clock+=dt;this.cooldown-=dt;
   if(this.cooldown>0)return [];
   this.cooldown=2.4;this.tickCount++;
   const decisions=this.decide(state,valid);
   // Only one economic transaction per tick, but tactical orders may coexist.
   const economic=decisions.filter(o=>['build','train','upgrade'].includes(o.type));
   const tactical=decisions.filter(o=>!['build','train','upgrade'].includes(o.type));
   // Reserve cycles for infrastructure and tech. A persistent training demand
   // must NEVER starve expansion; the city needs mines to fund future units.
   const build=economic.find(o=>o.type==='build');
   const train=economic.find(o=>o.type==='train');
   const upgrade=economic.find(o=>o.type==='upgrade');
   const priorityBuild=build?.reason==='restore_recruitment'||build?.reason==='income';
   const choice=priorityBuild?build:
     upgrade&&this.tickCount%5===0?upgrade:
     build&&this.tickCount%3===0?build:
     train||build||upgrade;
   const actions=choice?[...tactical,choice]:tactical;
   for(const action of actions){
    this.history.push({t:Math.round(this.clock*10)/10,...action});
   }
   if(this.history.length>80)this.history.splice(0,this.history.length-80);
   return actions;
  }
 }
 return {Director,planSite,COST,TYPES};
});
