/* Fighters — deterministic, budget-aware orc RTS director.
 * Separates economic/settlement decisions from animation and Three.js.
 * A layout planner scores build sites by access, spacing, and functional district.
 * UMD API for Node regression tests and browser runtime.
 */
(function(root,factory){
 const api=factory(root.FightersWalls||
  (typeof require==='function'?require('./rts-walls.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.FightersOrcStrategy=api;
})(typeof globalThis==='object'?globalThis:this,function(walls){
 'use strict';
 const TYPES=['barrack','hut','cauldron','factory'];
 const COST={barrack:180,hut:120,cauldron:200,factory:250};
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
   this.wallPerimeter=null;
  }
  reset(){
   this.clock=0;this.cooldown=0;this.lastRaid=-100;this.raidNumber=0;
   this.mode='develop';this.history=[];this.lastThreat=-100;this.tickCount=0;
   this.wallPerimeter=null;
  }
  snapshot(){
   return {clock:this.clock,mode:this.mode,raids:this.raidNumber,
    decisions:this.history.slice(-12),enabled:this.enabled};
  }
  decide(state,valid){
   if(!this.enabled||!state.ready||!state.running||state.paused)return [];
   const buildings=state.buildings.filter(b=>!b.destroyed);
   const structures=buildings.filter(b=>b.type!=='wall');
   const ramparts=buildings.filter(b=>b.type==='wall');
   const own=state.orcs.filter(u=>!u.dead),enemy=state.witches.filter(u=>!u.dead);
   const workers=own.filter(u=>u.role==='worker');
   const fighters=own.filter(u=>u.role!=='worker');
   // An enemy base is a strategic target only after a real line-of-sight discovery.
   const enemyBaseKnown=state.enemyBaseKnown===true;
   const barracks=structures.filter(b=>b.type==='barrack');
   const barrack=barracks.sort((a,b)=>(a.queue?.length||0)-(b.queue?.length||0))[0];
   // Neutral deposits are handled by miners, never as clan infrastructure.
   const base={x:19,z:18};
   const attackers=enemy.filter(u=>u.role!=='worker'&&
    (near(u,base,16)||buildings.some(b=>near(u,boxCentre(b),6.5))));
   const threatened=attackers.length>0;
   if(threatened){this.lastThreat=this.clock;this.mode='defend';}
   else this.mode=this.clock-this.lastThreat<10?'recover':
     enemyBaseKnown?'develop':'explore';
   const orders=[];
   const canSpend=(cost,reserve=0)=>state.gold>=cost+reserve;
   const queueLength=b=>b?.queue?.length||0;
   // Tactical defense takes priority over an offensive raid.
   if(threatened&&fighters.length){
    orders.push({type:'defend',x:attackers[0].x,z:attackers[0].z,reason:'enemy_at_base'});
   }
   // Recover a destroyed barrack before trying to train.
   if(!barrack&&canSpend(COST.barrack,40)){
    const site=planSite('barrack',structures,valid);
    if(site)orders.push({type:'build',building:'barrack',x:site.x,z:site.z,reason:'restore_recruitment'});
   }
   const cap=state.unitCap||15;
   const committed=state.populationCommitted??own.length;
   // Keep a defensive reserve while building an attacking group.
   if(barrack&&committed<cap&&queueLength(barrack)<2){
    const role=workers.length<2?'worker':
      this.tickCount%3===0&&state.cauldronAvailable!==false?'ranged':'melee';
    const price=role==='worker'?65:role==='ranged'?130:100;
    if(canSpend(price,this.clock<30?100:30))
     orders.push({type:'train',buildingId:barrack.id,role,
       reason:workers.length<2?'restore_workers':fighters.length<6?'reinforce':'prepare_raid'});
   }
   // Natural deposits are fixed world resources. The AI may train miners and
   // upgrade an existing mine, but NEVER create or place an additional mine.
   const wishlist=['hut','barrack','cauldron','factory','hut'];
   const desired={hut:2,barrack:2,cauldron:2,factory:2};
   if(this.clock>18&&structures.length<12){
    for(const type of wishlist){
     if(structures.filter(b=>b.type===type).length>=desired[type])continue;
     if(!canSpend(COST[type],type==='barrack'?100:160))continue;
     const site=planSite(type,structures,valid);
     if(site){orders.push({type:'build',building:type,x:site.x,z:site.z,reason:'planned_district'});break;}
    }
   }
   // Stone fortification is an *outer* ring, offset from the buildings to
   // intercept 6.2 m magic bolts, with a two-section west gate and interior
   // space reserved for future huts. Its original footprint stays stable as
   // the economy expands: no wandering walls around each new building.
   if(walls&&this.clock>35&&ramparts.length<30&&
      canSpend(32,220)&&state.wood>=10){
    if(!this.wallPerimeter)this.wallPerimeter=walls.perimeter(structures);
    const site=walls.planWall(buildings,valid,{perimeter:this.wallPerimeter});
    if(site)orders.push({type:'build',building:'wall',x:site.x,z:site.z,
      axis:site.axis,reason:'protect_village_'+site.side});
   }
   // Upgrade sustainably once a settlement is established.
   if(this.clock>this.upgradeAt&&canSpend(270,170)){
    const target=structures.filter(b=>b.level<3&&!b.queue.some(o=>o.kind==='upgrade'))
      .sort((a,b)=>{
       const priorities={barrack:0,mine:1,hut:2,factory:3,cauldron:4};
       return(a.level-b.level)||priorities[a.type]-priorities[b.type];
      })[0];
    if(target)orders.push({type:'upgrade',buildingId:target.id,reason:'development'});
   }
   // The population ceiling is real: expand living space before recruitment
   // stalls permanently. Upgrade only when no new building can be placed.
   // A fresh level-one hut is cheaper and provides more places than upgrading
   // an existing one. Do not spend the expansion budget on upgrades first.
   if(committed>=cap-1&&cap<32&&!orders.some(o=>o.type==='build')){
    const hut=structures.filter(b=>b.type==='hut'&&b.level<3&&
      !b.queue.some(q=>q.kind==='upgrade')).sort((a,b)=>a.level-b.level)[0];
    if(hut&&canSpend(160+hut.level*100,50))
      orders.unshift({type:'upgrade',buildingId:hut.id,reason:'housing'});
   }
   // Reserve one real fighter to explore unknown terrain. The waypoint comes
   // exclusively from the orcs' own fog grid, not from any enemy location.
   if(!threatened&&!enemyBaseKnown&&this.clock>=8&&state.scoutTarget){
    const scout=fighters.find(u=>u.scouting&&!u.attackOrder&&!u.foraging)||
      fighters.find(u=>!u.mining&&!u.attackOrder&&!u.destination&&!u.foraging);
    if(scout&&!scout.destination)
     orders.push({type:'scout',unitId:scout.id,
       x:state.scoutTarget.x,z:state.scoutTarget.z,reason:'unknown_territory'});
   }
   // Fire a raid only with a real group AND a discovered enemy headquarters.
   const unassigned=fighters.filter(u=>!u.mining&&!u.attackOrder&&
     !u.foraging&&!(u.attack?.target));
   const threshold=this.raidNumber===0?4:5;
   if(enemyBaseKnown&&!threatened&&this.clock>20&&
     unassigned.length>=threshold&&this.clock-this.lastRaid>22){
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
   const build=economic.find(o=>o.type==='build'&&o.building!=='wall');
   const wall=economic.find(o=>o.type==='build'&&o.building==='wall');
   const train=economic.find(o=>o.type==='train');
   const upgrade=economic.find(o=>o.type==='upgrade');
   const committed=state.populationCommitted??state.orcs.filter(o=>!o.dead).length;
   const priorityBuild=build?.reason==='restore_recruitment'||build?.reason==='income'||
     (build?.building==='hut'&&committed>=(state.unitCap||15)-1);
   const housing=upgrade?.reason==='housing';
   const choice=priorityBuild?build:housing?upgrade:
     upgrade&&this.tickCount%5===0?upgrade:
     build&&this.tickCount%3===0?build:
     wall&&this.tickCount%4===0?wall:
     train||build||upgrade||wall;
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
