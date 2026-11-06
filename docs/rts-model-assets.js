/* Fighters RTS — GLB parsing and explicit shared-model caching.
 * GLTFLoader and MeshoptDecoder are injected from the runtime import map;
 * the game renderer only receives decoded model data, never the loader.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersModelAssets=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({GLTFLoader,MeshoptDecoder}){
    if(typeof GLTFLoader!=='function'||!MeshoptDecoder)
      throw Error('GLTFLoader and MeshoptDecoder are required');
    const loader=new GLTFLoader();
    // The CC0 sword is meshopt-compressed: register before any GLB parsing.
    loader.setMeshoptDecoder(MeshoptDecoder);
    const sharedModels=new Map();

    function load(url){return loader.loadAsync(url);}
    function parse(data){return loader.parseAsync(data,'');}
    // Only explicitly shared model templates are memoized. Other loads must
    // remain fresh because game systems can mutate their scene graphs.
    function cached(key,url){
      if(!sharedModels.has(key))sharedModels.set(key,load(url));
      return sharedModels.get(key);
    }
    return Object.freeze({load,parse,cached});
  }

  return Object.freeze({create});
});
