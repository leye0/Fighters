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
  const TYPES=['leafy','pine','twisted','dead'];
  // These four trunks are deliberately inside the starting witches' 7.5 m
  // sight radius AND their narrow portrait-phone camera framing. The original
  // edge-only forest loaded correctly but stayed invisible under fog of war.
  const STARTING_GLADE=[
    {x:-16.1,z:-10.2,type:'leafy',angle:.6,height:4.4,radius:.46},
    {x:-13.4,z:-10.3,type:'twisted',angle:2.4,height:4.9,radius:.46},
    {x:-11.6,z:-11.8,type:'pine',angle:4.3,height:4.1,radius:.46},
    {x:-14.8,z:-7.9,type:'dead',angle:1.5,height:4.6,radius:.38}
  ];
  const AREAS=[
    // The building clusters and starting units remain unobstructed.
    {side:'west',count:13,range:[-7,25],types:['twisted','leafy','twisted','dead']},
    {side:'north',count:8,range:[-25,-7],types:['leafy','twisted','pine']},
    {side:'east',count:13,range:[-25,6],types:['pine','dead','pine','leafy']},
    {side:'south',count:11,range:[-7,25],types:['pine','dead','pine']},
    {side:'witch-glade',count:1,types:['twisted','leafy','dead']},
    {side:'orc-glade',count:5,types:['pine','dead','pine']}
  ];
  const RESERVED=[[-23.5,-17.5,7.4],[-18,-14,4.8],[22,20,9.2],
    [15,20,7.8],[1,26,4.4]];
  function createLayout(){
    let seed=0x7194fa21;
    const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    const trees=STARTING_GLADE.map(tree=>({...tree}));
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
        }else{
          x=3+random()*11;z=-18+random()*10;
        }
        if(Math.abs(x)>26.65||Math.abs(z)>26.65)continue;
        if(RESERVED.some(([rx,rz,r])=>Math.hypot(x-rx,z-rz)<r))continue;
        if(trees.some(t=>Math.hypot(t.x-x,t.z-z)<2.15))continue;
        const type=area.types[Math.floor(random()*area.types.length)];
        trees.push({x,z,type,angle:random()*Math.PI*2,
          height:(type==='pine'?4.0:type==='dead'?4.8:type==='twisted'?5.4:4.6)*(.83+random()*.34),
          radius:type==='dead'?.38:.46});
        created++;
      }
    }
    return trees;
  }
  function obstacles(layout){
    return layout.map((t,i)=>({id:'tree-'+i,shape:'aabb',
      minX:t.x-t.radius,maxX:t.x+t.radius,
      minZ:t.z-t.radius,maxZ:t.z+t.radius}));
  }
  return {TYPES,createLayout,obstacles};
});
