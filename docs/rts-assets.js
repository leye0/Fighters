/* Fighters RTS — model/audio binary transport, independent of Three.js and UI. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersAssets=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({loadingProfile,now=()=>performance.now(),
    fetchRequest=(...args)=>fetch(...args),warn=(...args)=>console.warn(...args)}){
    if(!loadingProfile||!loadingProfile.characters)throw Error('Missing asset loading metrics');

    async function fetchAsset(url,{compressed=false,timeout=18000}={}){
      const controller=new AbortController();
      const timeoutId=setTimeout(()=>controller.abort(),timeout);
      try{
        const response=await fetchRequest(url,{signal:controller.signal,cache:'default'});
        if(!response.ok)throw Error('HTTP '+response.status+' : '+url);
        const wireBytes=Number(response.headers.get('Content-Length')||0);
        const body=compressed?
          new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():
          response.arrayBuffer();
        const data=await body;
        if(data.byteLength<20)throw Error('Fichier incomplet : '+url);
        return {data,wireBytes};
      }finally{clearTimeout(timeoutId);}
    }

    async function getBinary(file,onProgress=()=>{}){
      const started=now(),isCharacter=/^human_(female|male)\.(?:rts\.)?glb$/.test(file);
      const rawUrl='./models/'+file;
      if(isCharacter&&typeof DecompressionStream==='function'){
        try{
          const result=await fetchAsset(rawUrl+'.gz',{compressed:true,timeout:20000});
          if(new DataView(result.data).getUint32(0,false)!==0x676c5446)
            throw Error('En-tête GLB invalide : '+file);
          loadingProfile.characters[file]={
            transport:'gzip',wireBytes:result.wireBytes,decodedBytes:result.data.byteLength,
            downloadAndDecodeMs:Math.round(now()-started)
          };
          loadingProfile.compressed=true;onProgress(100);
          return result.data;
        }catch(error){
          warn('Repli vers modèle RTS non compressé:',file,error);
        }
      }
      let result;
      try{result=await fetchAsset(rawUrl,{timeout:20000});}
      catch(error){
        if(isCharacter)throw Error('Modèle RTS indisponible ('+file+'). Réessayez le chargement.');
        const fallback='https://www.pixeltriks.com/characters/humans/'+
          (file.includes('Peasant')?'outfits/':'hair/')+file;
        result=await fetchAsset(fallback,{timeout:20000});
      }
      if(isCharacter)loadingProfile.characters[file]={
        transport:'raw',wireBytes:result.wireBytes||result.data.byteLength,
        decodedBytes:result.data.byteLength,
        downloadAndDecodeMs:Math.round(now()-started)
      };
      onProgress(100);return result.data;
    }

    return Object.freeze({fetchAsset,getBinary});
  }
  return Object.freeze({create});
});
