/* Camera-aligned, square-on-screen RTS battlefield. The simulation keeps
 * ordinary X/Z world coordinates; only the playable boundary and the
 * top-down minimap use these isometric screen-aligned map coordinates.
 * No Three.js dependency. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersMap=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const INV_SQRT2=Math.SQRT1_2;
  const SQRT3=Math.sqrt(3);
  const INV_SQRT6=1/Math.sqrt(6);
  const HALF=28,SIZE=HALF*2;
  // The current camera is at (+X,+Y,+Z), with a 45-degree azimuth and a
  // 35.264-degree elevation. Its orthographic ground projection is exactly
  // screenX=(x-z)/sqrt(2), screenDown=(x+z)/sqrt(6).
  function toMap(x,z){return {x:(x-z)*INV_SQRT2,z:(x+z)*INV_SQRT6};}
  function toWorld(x,z){return {x:(x+SQRT3*z)*INV_SQRT2,z:(SQRT3*z-x)*INV_SQRT2};}
  // A unit radius is in physical world units. The map's vertical axis is
  // sqrt(3) times longer on the ground, so its clearance is correspondingly
  // smaller in map coordinates.
  function contains(x,z,padding=0){
    const p=toMap(x,z);
    return Math.abs(p.x)<=HALF-padding+1e-8&&
      Math.abs(p.z)<=HALF-padding/SQRT3+1e-8;
  }
  function clamp(x,z,padding=0){
    const p=toMap(x,z);
    const limitX=Math.max(0,HALF-padding),limitZ=Math.max(0,HALF-padding/SQRT3);
    return toWorld(Math.max(-limitX,Math.min(limitX,p.x)),
      Math.max(-limitZ,Math.min(limitZ,p.z)));
  }
  function corners(){return [toWorld(-HALF,-HALF),toWorld(HALF,-HALF),
    toWorld(HALF,HALF),toWorld(-HALF,HALF)];}
  // Width of the world-space AABB enclosing the rotated playable rectangle.
  const worldHalf=Math.ceil((HALF+SQRT3*HALF)*INV_SQRT2+1);
  return Object.freeze({HALF,SIZE,worldHalf,toMap,toWorld,contains,clamp,corners});
});
