/* Orc silhouettes for the native Quaternius skinned Peasant costumes.
 * Change mesh vertices in the bind pose, never the 65 animated bones or the
 * hand sockets that hold swords, axes, hammers and pickaxes.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersOrcAppearance=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const SKIN_COLORS=Object.freeze([0x65f31a,0x83fa27,0x4ae919,0x76f52a]);
  const geometryCache=new WeakMap();
  const clamp01=value=>Math.max(0,Math.min(1,value));
  const smoothstep=(a,b,x)=>{
    const t=clamp01((x-a)/(b-a));
    return t*t*(3-2*t);
  };
  // Peak around chest/shoulder height; virtually no deformation at the waist,
  // wrists or neck. The silhouette is ~38% wider and ~20% deeper at its peak.
  const chestInfluence=y=>smoothstep(.82,1.34,y)*(1-smoothstep(1.73,1.96,y));
  const isGripBone=name=>/(?:hand|wrist|thumb|index|middle|ring|pinky|finger)/i.test(name);

  function bulkyGarmentGeometry(source,bones){
    if(geometryCache.has(source))return geometryCache.get(source);
    const geometry=source.clone(),position=geometry.getAttribute('position');
    const indices=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight');
    if(!position||!indices||!weights||!bones?.length)
      throw Error('Orc costume requires the original skinned Peasant geometry');
    let changed=0;
    for(let i=0;i<position.count;i++){
      let gripInfluence=0;
      for(let j=0;j<4;j++){
        if(isGripBone(bones[indices.getComponent(i,j)]?.name||''))
          gripInfluence+=weights.getComponent(i,j);
      }
      const effect=chestInfluence(position.getY(i))*(1-clamp01(gripInfluence));
      if(effect<.00001)continue;
      position.setX(i,position.getX(i)*(1+.38*effect));
      position.setZ(i,position.getZ(i)*(1+.20*effect));
      changed++;
    }
    position.needsUpdate=true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.orcBulky=true;
    geometry.userData.orcChangedVertices=changed;
    geometryCache.set(source,geometry);
    return geometry;
  }
  return {SKIN_COLORS,bulkyGarmentGeometry,chestInfluence};
});
