/* Fighters RTS — compact per-faction Warcraft-style exploration.
 * The map is represented by two 8-bit grids per clan (explored + visible).
 * One shared RGBA buffer per clan feeds a single fullscreen WebGL fog pass.
 * No Three.js dependency; usable in deterministic Node tests.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersFog=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const CLANS=['witch','orc'];
  class FogGrid{
    constructor({halfSize=28,cellSize=.5,radius=7.5,fade=1.25}={}){
      if(!(halfSize>0&&cellSize>0&&radius>fade&&fade>0))
        throw Error('Invalid fog dimensions');
      this.halfSize=halfSize;
      this.size=Math.ceil(halfSize*2/cellSize);
      this.cellSize=halfSize*2/this.size;
      this.radius=radius;
      this.fade=fade;
      this.cells=this.size*this.size;
      this.maps={};
      for(const clan of CLANS)this.maps[clan]={
        explored:new Uint8Array(this.cells),
        visible:new Uint8Array(this.cells),
        rgba:new Uint8Array(this.cells*4)
      };
      this.reset();
    }
    reset(){
      for(const clan of CLANS){
        const map=this.maps[clan];
        map.explored.fill(0);map.visible.fill(0);map.rgba.fill(0);
        for(let i=3;i<map.rgba.length;i+=4)map.rgba[i]=255;
      }
    }
    index(x,z){
      const col=Math.floor((x+this.halfSize)/this.cellSize);
      const row=Math.floor((z+this.halfSize)/this.cellSize);
      return col>=0&&row>=0&&col<this.size&&row<this.size?
        row*this.size+col:-1;
    }
    update(clan,sources){
      const map=this.maps[clan];
      if(!map)throw Error('Unknown fog faction: '+clan);
      const {visible,explored,rgba}=map;
      visible.fill(0);
      const outer=this.radius,inner=outer-this.fade,size=this.size;
      const step=this.cellSize,half=this.halfSize;
      for(const unit of sources){
        if(!Number.isFinite(unit.x)||!Number.isFinite(unit.z))continue;
        const left=Math.max(0,Math.floor((unit.x-outer+half)/step));
        const right=Math.min(size-1,Math.floor((unit.x+outer+half)/step));
        const low=Math.max(0,Math.floor((unit.z-outer+half)/step));
        const high=Math.min(size-1,Math.floor((unit.z+outer+half)/step));
        for(let row=low;row<=high;row++){
          const dz=(row+.5)*step-half-unit.z;
          for(let col=left;col<=right;col++){
            const dx=(col+.5)*step-half-unit.x;
            const distance=Math.hypot(dx,dz);
            if(distance>=outer)continue;
            const amount=distance<=inner?255:
              Math.max(1,Math.round(255*(outer-distance)/this.fade));
            const idx=row*size+col;
            if(amount>visible[idx])visible[idx]=amount;
          }
        }
      }
      for(let i=0,j=0;i<this.cells;i++,j+=4){
        if(visible[i]>explored[i])explored[i]=visible[i];
        rgba[j]=explored[i];rgba[j+1]=visible[i];
      }
      return rgba;
    }
    // Find the next unknown, navigable waypoint from this clan's OWN map.
    // No enemy positions or enemy exploration state are consulted.
    frontier(clan,origin,valid=()=>true){
      if(!this.maps[clan])throw Error('Unknown fog faction: '+clan);
      if(!Number.isFinite(origin?.x)||!Number.isFinite(origin?.z))return null;
      const candidates=[];
      const step=4.5,limit=this.halfSize-3;
      for(let z=-limit;z<=limit;z+=step){
        for(let x=-limit;x<=limit;x+=step){
          if(this.sample(x,z,clan).explored>.15)continue;
          // Prefer reachable nearby frontiers, gently favouring the neutral
          // centre so scouts explore contested ground before remote corners.
          const score=Math.hypot(x-origin.x,z-origin.z)+.15*Math.hypot(x,z);
          candidates.push({x:Math.round(x*10)/10,z:Math.round(z*10)/10,score});
        }
      }
      candidates.sort((a,b)=>a.score-b.score||a.z-b.z||a.x-b.x);
      for(const p of candidates)if(valid(p.x,p.z))return{x:p.x,z:p.z};
      return null;
    }
    textureData(clan){return this.maps[clan].rgba;}
    sample(x,z,clan='witch'){
      const idx=this.index(x,z),map=this.maps[clan];
      if(!map)throw Error('Unknown fog faction: '+clan);
      return idx<0?{explored:0,visible:0}:{
        explored:map.explored[idx]/255,visible:map.visible[idx]/255
      };
    }
    visibleAt(x,z,clan='witch'){
      return this.sample(x,z,clan).visible>.2;
    }
    stats(clan='witch'){
      const map=this.maps[clan];
      let explored=0,visible=0;
      for(let i=0;i<this.cells;i++){
        if(map.explored[i]>0)explored++;
        if(map.visible[i]>0)visible++;
      }
      return {size:this.size,cellSize:this.cellSize,cells:this.cells,
        exploredCells:explored,visibleCells:visible,
        bytes:CLANS.length*(this.cells*2+this.cells*4)};
    }
  }
  return {FogGrid};
});
