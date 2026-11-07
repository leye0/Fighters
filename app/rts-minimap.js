/* Fighters RTS — fog-aware minimap rendering, independent of gameplay orders. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersMinimap=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({canvas,arena,fogOfWar,makeGroundFog,groundSightSources,
    getBuildings,getUnits,knownEnemyBuildings,getFaction,viewport,worldPoint}){
    const context=canvas.getContext('2d',{alpha:false});
    const raster=canvas.ownerDocument.createElement('canvas');
    raster.width=112;raster.height=112;
    const rasterContext=raster.getContext('2d',{alpha:false});
    const image=rasterContext.createImageData(112,112);
    // Reuse a fixed world-space lookup instead of allocating 12,544
    // projected points on every repaint.
    const indices=new Int32Array(112*112);
    for(let row=0;row<112;row++)for(let col=0;col<112;col++){
      const world=arena.toWorld((col+.5)/112*arena.SIZE-arena.HALF,
        (row+.5)/112*arena.SIZE-arena.HALF);
      indices[row*112+col]=fogOfWar.index(world.x,world.z);
    }
    // Raven exploration persists, but the moving birds cannot expose their
    // exact location as a bright minimap patch.
    const groundFog=makeGroundFog();

    function point(x,z){
      const p=arena.toMap(x,z);
      return {x:(p.x+arena.HALF)/arena.SIZE*canvas.width,
        y:(p.z+arena.HALF)/arena.SIZE*canvas.height};
    }

    function draw(){
      const faction=getFaction(),fog=fogOfWar.maps[faction],paint=image.data;
      groundFog.update(faction,groundSightSources(faction));
      const groundVisible=groundFog.maps[faction].visible;
      for(let cell=0;cell<indices.length;cell++){
        const index=indices[cell],j=cell*4;
        const light=index<0?0:Math.max(groundVisible[index],fog.explored[index]*.28)/255;
        paint[j]=Math.round(7+46*light);
        paint[j+1]=Math.round(10+90*light);
        paint[j+2]=Math.round(11+54*light);
        paint[j+3]=255;
      }
      rasterContext.putImageData(image,0,0);
      context.imageSmoothingEnabled=false;
      context.drawImage(raster,0,0,canvas.width,canvas.height);
      for(const building of getBuildings()){
        if(!building.hitbox)continue;
        const box=building.hitbox,x=(box.minX+box.maxX)/2,z=(box.minZ+box.maxZ)/2;
        const visibility=fogOfWar.sample(x,z,faction);
        if(visibility.explored<.2||
          (building.clanId!==(faction==='witch'?'witch':'orcs')&&
            building.clanId!=='neutral'&&!knownEnemyBuildings[faction].has(building.id)))continue;
        context.fillStyle=building.type==='mine'?'#d4c36e':
          building.clanId===(faction==='witch'?'witch':'orcs')?'#b2d3ce':'#c16c57';
        const corners=[[box.minX,box.minZ],[box.maxX,box.minZ],
          [box.maxX,box.maxZ],[box.minX,box.maxZ]].map(([bx,bz])=>point(bx,bz));
        context.beginPath();
        corners.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));
        context.closePath();context.fill();
      }
      for(const actor of getUnits()){
        if(actor.dead||actor.kind!==faction&&!fogOfWar.exploredAt(
          actor.root.position.x,actor.root.position.z,faction))continue;
        context.fillStyle=actor.kind===faction?'#c6f4a3':'#ff7b76';
        const p=point(actor.root.position.x,actor.root.position.z);
        context.fillRect(p.x-1,p.y-1,3,3);
      }
      context.strokeStyle='#f6f1c3';
      context.lineWidth=1;
      const rect=viewport.getBoundingClientRect();
      const footprint=[[rect.left,rect.top],[rect.right,rect.top],
        [rect.right,rect.bottom],[rect.left,rect.bottom]]
        .map(([x,y])=>worldPoint(x,y)).filter(Boolean).map(p=>point(p.x,p.z));
      if(footprint.length===4){
        context.beginPath();
        footprint.forEach((p,i)=>i?context.lineTo(p.x,p.y):
          context.moveTo(p.x,p.y));
        context.closePath();context.stroke();
      }
    }

    function worldAt(clientX,clientY){
      const rect=canvas.getBoundingClientRect();
      if(!rect.width||!rect.height)return null;
      return arena.toWorld((clientX-rect.left)/rect.width*arena.SIZE-arena.HALF,
        (clientY-rect.top)/rect.height*arena.SIZE-arena.HALF);
    }

    return Object.freeze({draw,worldAt,groundFog});
  }
  return Object.freeze({create});
});
