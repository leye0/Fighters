/* Deterministic, low-density fantasy forest for the RTS arena.
 * Decorative models have a small trunk-only collision box; their large
 * canopies do not prevent walking underneath them. No Three.js dependency.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersForest=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const TYPES=['twisted','dead'];
  // These four trunks are deliberately visible in the witches' starting glade.
  // The rest must also be discoverable while traversing the playable interior:
  // an edge-only layout looks like an empty map during normal exploration.
  const STARTING_GLADE=[
    {x:-16.1,z:-10.2,type:'twisted',angle:.6,height:4.4,radius:.46},
    {x:-13.4,z:-10.3,type:'twisted',angle:2.4,height:4.9,radius:.46},
    {x:-11.6,z:-11.8,type:'dead',angle:4.3,height:4.1,radius:.38},
    {x:-14.8,z:-7.9,type:'dead',angle:1.5,height:4.6,radius:.38}
  ];
  const ORC_STARTING_GLADE=[
    {x:8.2,z:19.8,type:'twisted',angle:2.2,height:4.9,radius:.46},
    {x:9.8,z:14.7,type:'dead',angle:4.7,height:4.6,radius:.38}
  ];
  const AREAS=[
    // The building clusters and starting units remain unobstructed.
    {side:'west',count:9,range:[-7,25],types:['twisted','twisted','dead']},
    {side:'north',count:7,range:[-25,-7],types:['twisted','dead','twisted']},
    {side:'east',count:9,range:[-25,6],types:['dead','twisted','dead']},
    {side:'south',count:8,range:[-7,25],types:['dead','twisted','dead']},
    {side:'witch-glade',count:4,types:['twisted','twisted','dead']},
    {side:'orc-glade',count:3,types:['dead','twisted','dead']},
    {side:'center-groves',count:9,types:['twisted','dead','twisted','dead']}
  ];
  const RESERVED=[[-23.5,-17.5,7.4],[-18,-14,4.8],[22,20,9.2],
    [15,20,7.8],[1,26,4.4],[-12,-21,4.4],[-35,-26,4.6],[32,31,4.6],
    // Canonical orc construction site exercised in the playable browser QA.
    [8,-10,5.0]];
  function createLayout({map=null}={}){
    let seed=0x7194fa21;
    const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    const trees=[...STARTING_GLADE,...ORC_STARTING_GLADE].map(tree=>({...tree}));
    for(const area of AREAS){
      let created=0;
      for(let trial=0;trial<area.count*26&&created<area.count;trial++){
        let x,z;
        if(area.side==='west'||area.side==='east'){
          x=(area.side==='west'?-25.4:25.4)+(random()-.5)*2.5;
          z=area.range[0]+random()*(area.range[1]-area.range[0]);
        }else if(area.side==='north'||area.side==='south'){
          z=(area.side==='north'?25.4:-25.4)+(random()-.5)*2.5;
          x=area.range[0]+random()*(area.range[1]-area.range[0]);
        }else if(area.side==='witch-glade'){
          x=-16+random()*8;z=7+random()*13;
        }else if(area.side==='center-groves'){
          x=-12+random()*26;z=-11+random()*24;
        }else{
          x=3+random()*11;z=-18+random()*10;
        }
        if(Math.abs(x)>26.65||Math.abs(z)>26.65)continue;
        if(RESERVED.some(([rx,rz,r])=>Math.hypot(x-rx,z-rz)<r))continue;
        if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<2.15))continue;
        const type=area.types[Math.floor(random()*area.types.length)];
        trees.push({x,z,type,angle:random()*Math.PI*2,
          height:(type==='dead'?4.8:5.4)*(.83+random()*.34),
          radius:type==='dead'?.38:.46});
        created++;
      }
    }
    if(!map)return trees;
    // Keep the established home groves, relocating only trees that used to
    // occupy the corners outside the new camera-aligned playable boundary.
    const placed=trees.filter(tree=>map.contains(tree.x,tree.z,tree.radius+.85));
    for(let trial=0;placed.length<trees.length&&trial<trees.length*200;trial++){
      const mapX=(random()*2-1)*(map.HALF-1.8);
      const mapZ=(random()*2-1)*(map.HALF-1.8);
      const {x,z}=map.toWorld(mapX,mapZ);
      if(RESERVED.some(([rx,rz,r])=>Math.hypot(x-rx,z-rz)<r)||
        placed.some(t=>Math.hypot(t.x-x,t.z-z)<2.15))continue;
      const type=TYPES[Math.floor(random()*TYPES.length)];
      placed.push({x,z,type,angle:random()*Math.PI*2,
        height:(type==='dead'?4.8:5.4)*(.83+random()*.34),
        radius:type==='dead'?.38:.46});
    }
    if(placed.length!==trees.length)throw Error('Cannot distribute the forest inside the map');
    // Keep the established home groves while populating the newly added
    // perimeter. Otherwise a 50%-wider map would have empty outer quarters.
    const outerCount=map.HALF>28?36:0;
    for(let trial=0,added=0;trial<outerCount*200&&added<outerCount;trial++){
      const mapX=(random()*2-1)*(map.HALF-1.8);
      const mapZ=(random()*2-1)*(map.HALF-1.8);
      if(Math.max(Math.abs(mapX),Math.abs(mapZ))<29)continue;
      const {x,z}=map.toWorld(mapX,mapZ);
      if(RESERVED.some(([rx,rz,r])=>Math.hypot(x-rx,z-rz)<r)||
        placed.some(t=>Math.hypot(t.x-x,t.z-z)<2.15))continue;
      const type=TYPES[Math.floor(random()*TYPES.length)];
      placed.push({x,z,type,angle:random()*Math.PI*2,
        height:(type==='dead'?4.8:5.4)*(.83+random()*.34),
        radius:type==='dead'?.38:.46});
      added++;
    }
    if(placed.length!==trees.length+outerCount)throw Error('Cannot populate expanded map perimeter');
    return placed;
  }
  function obstacles(layout){
    // Keep stable IDs after harvesting; existing routes must not suddenly
    // point to a different tree when one trunk disappears.
    return layout.flatMap((t,i)=>t.felled?[]:[{id:'tree-'+i,shape:'aabb',
      minX:t.x-t.radius,maxX:t.x+t.radius,
      minZ:t.z-t.radius,maxZ:t.z+t.radius}]);
  }
  return {TYPES,createLayout,obstacles};
});
