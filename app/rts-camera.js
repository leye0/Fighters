/* Fighters RTS — camera projection and panning, separate from input gestures. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersCamera=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({camera,look,offset,arena,viewport,panel,renderer,
    zoom,worldPoint,matchMedia,clamp}){
    if(!camera||!look||!offset||!arena||!viewport||!renderer)
      throw Error('Missing RTS camera service');

    function position(center){
      const next=arena.clamp(center.x,center.z,2);
      look.set(next.x,1.15,next.z);
      camera.position.copy(look).add(offset);
      camera.lookAt(look);
      return next;
    }

    function pan(center,dx,dy){
      const box=viewport.getBoundingClientRect(),cx=box.left+box.width/2,
        cy=box.top+box.height/2;
      const before=worldPoint(cx,cy),after=worldPoint(cx+dx,cy+dy);
      if(!before||!after)return center;
      return position(arena.clamp(center.x+before.x-after.x,
        center.z+before.z-after.z,2));
    }

    function resize(){
      const w=viewport.clientWidth,h=viewport.clientHeight;
      const aspect=w/Math.max(1,h),halfHeight=zoom;
      // Keep Warcraft II's left command strip on desktop, bottom on mobile.
      // The panel changes camera framing, not the fixed orthographic zoom.
      const frame=panel()?.getBoundingClientRect();
      const sidebar=matchMedia('(min-width:821px) and (min-height:541px)').matches;
      const cutX=sidebar?clamp((frame?.width||0)/Math.max(w,1),0,.4):0;
      const cutY=sidebar?0:clamp((frame?.height||0)/Math.max(h,1),0,.42);
      camera.left=-halfHeight*aspect*(1+cutX);
      camera.right=halfHeight*aspect*(1-cutX);
      camera.top=halfHeight*(1-cutY);
      camera.bottom=-halfHeight*(1+cutY);
      camera.updateProjectionMatrix();
      renderer.setSize(w,h,false);
    }

    return Object.freeze({position,pan,resize});
  }
  return Object.freeze({create});
});
