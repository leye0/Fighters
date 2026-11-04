/* Lightweight Orc SFX engine. One unlocked AudioContext, lazy MP3 decoding,
 * a bounded LRU cache and a bounded number of voices. No Three.js dependency.
 * The visibility callback is checked twice (before requesting and before play)
 * so an unseen Orc cannot disclose itself while audio is loading.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSound=api;
})(typeof globalThis==='object'?globalThis:this,function(root){
  'use strict';
  const TYPES=['short','long','loud'];
  const MIX={
    short:{gain:.34,cooldown:450},
    long:{gain:.40,cooldown:1050},
    loud:{gain:.38,cooldown:320}
  };
  const VALID_PATH=/^(short|long|loud)\/Orc_\d{2}\.mp3$/;
  class Engine{
    constructor({fetcher,contextFactory,random,now,
      manifestUrl='./sounds/orcs/manifest.json',rootUrl='./sounds/orcs/',
      maxActive=4,maxCached=12,maxPending=3}={}){
      this.fetcher=fetcher||((url,options)=>root.fetch(url,options));
      this.contextFactory=contextFactory||
        (()=>new (root.AudioContext||root.webkitAudioContext)());
      this.random=random||Math.random;
      this.now=now||(()=>Date.now());
      this.manifestUrl=manifestUrl;this.rootUrl=rootUrl;
      this.maxActive=maxActive;this.maxCached=maxCached;this.maxPending=maxPending;
      this.context=null;this.loading=null;
      this.catalog={short:[],long:[],loud:[]};
      this.cache=new Map();this.pending=new Map();this.controllers=new Set();
      this.active=new Set();this.lastSound=new Map();this.lastTime=new Map();
      this.paused=false;this.generation=0;
      this.stats={played:0,visibilityBlocked:0,cooldownBlocked:0,loadErrors:0};
    }
    load(){
      if(this.loading)return this.loading;
      this.loading=Promise.resolve().then(()=>this.fetcher(this.manifestUrl))
        .then(response=>{
          if(!response.ok)throw Error('Orc sound manifest HTTP '+response.status);
          return response.json();
        }).then(data=>{
          const groups={short:[],long:[],loud:[]};
          for(const sound of data.sounds||[]){
            if(!TYPES.includes(sound.category)||!VALID_PATH.test(sound.path)||
              !sound.path.startsWith(sound.category+'/'))continue;
            groups[sound.category].push(sound.path);
          }
          if(TYPES.some(type=>groups[type].length===0))
            throw Error('Orc sound categories are incomplete');
          this.catalog=groups;
          return groups;
        }).catch(error=>{
          this.stats.loadErrors++;
          console.warn('Fighters Orc sounds unavailable:',error);
          this.loading=null;
          return null;
        });
      return this.loading;
    }
    // Must be called synchronously inside the Start button's user gesture.
    unlock(){
      try{
        if(!this.context)this.context=this.contextFactory();
        this.paused=false;
        Promise.resolve(this.context.resume()).catch(()=>{});
        void this.load();
        return true;
      }catch(error){
        console.warn('Fighters audio not supported:',error);
        return false;
      }
    }
    setPaused(value){
      this.paused=!!value;
      if(!this.context)return;
      const operation=this.paused?this.context.suspend():this.context.resume();
      Promise.resolve(operation).catch(()=>{});
    }
    reset(){
      this.generation++;
      for(const controller of this.controllers)controller.abort();
      this.controllers.clear();this.pending.clear();
      for(const voice of this.active){
        voice.source.onended=null;
        try{voice.source.stop();}catch(_){}
        voice.source.disconnect();voice.gain.disconnect();
      }
      this.active.clear();this.lastTime.clear();this.lastSound.clear();
      // Keep at most maxCached decoded buffers between matches, never one
      // Audio element or WebAudio node per unit.
    }
    async bufferFor(path){
      if(this.cache.has(path)){
        const buffer=this.cache.get(path);
        this.cache.delete(path);this.cache.set(path,buffer);
        return buffer;
      }
      if(this.pending.has(path))return this.pending.get(path);
      if(this.pending.size>=this.maxPending)return null;
      const generation=this.generation;
      const controller=new AbortController();
      this.controllers.add(controller);
      const task=(async()=>{
        const timer=setTimeout(()=>controller.abort(),6000);
        try{
          const response=await this.fetcher(this.rootUrl+path,{signal:controller.signal});
          if(!response.ok)throw Error('Orc preview HTTP '+response.status);
          const bytes=await response.arrayBuffer();
          const buffer=await this.context.decodeAudioData(bytes);
          if(generation!==this.generation)return null;
          this.cache.set(path,buffer);
          while(this.cache.size>this.maxCached)
            this.cache.delete(this.cache.keys().next().value);
          return buffer;
        }catch(error){
          if(generation===this.generation){
            this.stats.loadErrors++;
            console.warn('Orc sound skipped:',path,error);
          }
          return null;
        }finally{
          clearTimeout(timer);
          this.controllers.delete(controller);
        }
      })();
      this.pending.set(path,task);
      try{return await task;}
      finally{if(this.pending.get(path)===task)this.pending.delete(path);}
    }
    canPlay(canHear){
      try{return !!this.context&&!this.paused&&this.context.state==='running'&&
        (typeof canHear!=='function'||canHear());}
      catch(_){return false;}
    }
    async play(category,canHear=()=>true){
      if(!TYPES.includes(category))return false;
      if(!this.canPlay(canHear)){
        if(typeof canHear==='function'){
          try{if(!canHear())this.stats.visibilityBlocked++;}catch(_){}
        }
        return false;
      }
      const requestedAt=this.now(),last=this.lastTime.get(category)??-Infinity;
      if(requestedAt-last<MIX[category].cooldown){
        this.stats.cooldownBlocked++;return false;
      }
      const groups=await this.load();
      if(!groups||!this.canPlay(canHear)||requestedAt!==requestedAt)return false;
      if(this.active.size>=this.maxActive)return false;
      const paths=groups[category];
      const previous=this.lastSound.get(category);
      const available=paths.length>1?paths.filter(path=>path!==previous):paths;
      const path=available[Math.min(available.length-1,
        Math.floor(Math.max(0,this.random())*available.length))];
      if(!path)return false;
      this.lastSound.set(category,path);
      this.lastTime.set(category,requestedAt);
      const generation=this.generation;
      const buffer=await this.bufferFor(path);
      if(!buffer||generation!==this.generation||
        this.now()-requestedAt>1800||!this.canPlay(canHear)||
        this.active.size>=this.maxActive)return false;
      const source=this.context.createBufferSource();
      const gain=this.context.createGain();
      source.buffer=buffer;gain.gain.value=MIX[category].gain;
      source.connect(gain);gain.connect(this.context.destination);
      const voice={source,gain};
      this.active.add(voice);
      source.onended=()=>{
        this.active.delete(voice);
        source.disconnect();gain.disconnect();
      };
      try{
        source.start();
        this.stats.played++;
        return true;
      }catch(error){
        source.onended=null;this.active.delete(voice);
        source.disconnect();gain.disconnect();
        return false;
      }
    }
    snapshot(){
      return {available:Object.fromEntries(TYPES.map(type=>
        [type,this.catalog[type].length])),
        active:this.active.size,cached:this.cache.size,pending:this.pending.size,
        paused:this.paused,...this.stats};
    }
  }
  return {Engine};
});
