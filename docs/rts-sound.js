/* Lightweight faction SFX engine. One unlocked AudioContext, lazy MP3 decoding,
 * a bounded LRU cache and a bounded number of voices. No Three.js dependency.
 * The visibility callback is checked twice (before requesting and before play)
 * so an unseen unit cannot disclose itself while audio is loading.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersSound=api;
})(typeof globalThis==='object'?globalThis:this,function(root){
  'use strict';
  const DEFAULT_TYPES=['short','long','loud','work'];
  const MIX={
    short:{gain:.34,cooldown:450},
    long:{gain:.40,cooldown:1050},
    loud:{gain:.38,cooldown:320},
    // One short, quiet impact per nearby construction swing; category-wide
    // cooldown complements the global throttle shared by both factions.
    work:{gain:.22,cooldown:450},
    interaction:{gain:.34,cooldown:450},
    creation:{gain:.40,cooldown:1050},
    attack:{gain:.48,cooldown:600},
    destruction:{gain:.38,cooldown:320}
  };
  const VALID_PATH=/^[a-z]+\/[A-Za-z][A-Za-z0-9_-]*\.mp3$/;
  class Engine{
    constructor({fetcher,contextFactory,random,now,
      manifestUrl='./sounds/orcs/manifest.json',rootUrl='./sounds/orcs/',
      assetVersion='',
      categories=DEFAULT_TYPES,allowEmptyCategories=[],
      maxActive=4,maxCached=12,maxPending=3}={}){
      this.fetcher=fetcher||((url,options)=>root.fetch(url,options));
      this.contextFactory=contextFactory||
        (()=>new (root.AudioContext||root.webkitAudioContext)());
      this.random=random||Math.random;
      this.now=now||(()=>Date.now());
      this.manifestUrl=manifestUrl;this.rootUrl=rootUrl;
      this.assetVersion=/^[a-zA-Z0-9-]*$/.test(assetVersion)?assetVersion:'';
      this.categories=[...categories];
      if(this.categories.some(type=>!Object.hasOwn(MIX,type)))
        throw Error('Unknown sound category');
      this.allowEmptyCategories=new Set(allowEmptyCategories);
      this.maxActive=maxActive;this.maxCached=maxCached;this.maxPending=maxPending;
      this.context=null;this.loading=null;this.hammerBuffer=null;
      this.catalog=Object.fromEntries(this.categories.map(type=>[type,[]]));
      this.voices=Object.fromEntries(this.categories.map(type=>[type,Object.create(null)]));
      this.cache=new Map();this.pending=new Map();this.controllers=new Set();
      this.active=new Set();this.lastSound=new Map();this.lastTime=new Map();
      // One shuffled phrase deck per character and event; the voice itself
      // remains that character's role. No immediate repeats at deck rollover.
      this.phraseDecks=new Map();
      this.paused=false;this.generation=0;this.lastError=null;
      this.stats={played:0,visibilityBlocked:0,cooldownBlocked:0,loadErrors:0};
    }
    load(){
      if(this.loading)return this.loading;
      this.loading=Promise.resolve().then(()=>this.fetcher(this.manifestUrl))
        .then(response=>{
          if(!response.ok)throw Error('Sound manifest HTTP '+response.status);
          return response.json();
        }).then(data=>{
          const groups=Object.fromEntries(this.categories.map(type=>[type,[]]));
          const voices=Object.fromEntries(this.categories.map(type=>[type,Object.create(null)]));
          for(const sound of data.sounds||[]){
            if(!this.categories.includes(sound.category)||
              typeof sound.path!=='string'||!VALID_PATH.test(sound.path)||
              !sound.path.startsWith(sound.category+'/'))continue;
            groups[sound.category].push(sound.path);
            if(typeof sound.voice==='string'&&/^[a-z]+$/.test(sound.voice)){
              (voices[sound.category][sound.voice]??=[]).push(sound.path);
            }
          }
          if(this.categories.some(type=>groups[type].length===0&&
            !this.allowEmptyCategories.has(type)))
            throw Error('Sound categories are incomplete');
          this.catalog=groups;
          this.voices=voices;
          return groups;
        }).catch(error=>{
          this.stats.loadErrors++;this.lastError=String(error);
          console.warn('Fighters sounds unavailable:',this.manifestUrl,error);
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
        this.resumeFromGesture();
        void this.load();
        return true;
      }catch(error){
        this.lastError=String(error);
        console.warn('Fighters audio not supported:',error);
        return false;
      }
    }
    // iOS/WebKit may interrupt WebAudio after switching apps. This method
    // must run during a real pointer or keyboard gesture to resume reliably.
    resumeFromGesture(){
      if(!this.context||this.paused)return false;
      if(this.context.state!=='running'){
        try{
          Promise.resolve(this.context.resume()).catch(error=>{
            this.lastError='AudioContext resume: '+String(error);
          });
        }catch(error){this.lastError='AudioContext resume: '+String(error);}
      }
      return true;
    }
    setPaused(value){
      this.paused=!!value;
      if(!this.context)return;
      if(!this.paused){this.resumeFromGesture();return;}
      Promise.resolve(this.context.suspend()).catch(error=>{
        this.lastError='AudioContext suspend: '+String(error);
      });
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
      this.phraseDecks.clear();
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
          const url=this.rootUrl+path+(this.assetVersion?'?v='+this.assetVersion:'');
          const response=await this.fetcher(url,{signal:controller.signal});
          if(!response.ok)throw Error('Sound preview HTTP '+response.status);
          const bytes=await response.arrayBuffer();
          const buffer=await this.context.decodeAudioData(bytes);
          if(generation!==this.generation)return null;
          this.cache.set(path,buffer);
          while(this.cache.size>this.maxCached)
            this.cache.delete(this.cache.keys().next().value);
          return buffer;
        }catch(error){
          if(generation===this.generation){
            this.stats.loadErrors++;this.lastError=String(error);
            console.warn('Sound skipped:',path,error);
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
    phraseFor(unitId,category,role,paths){
      const key=category+':'+(role||'any')+':'+unitId;
      let deck=this.phraseDecks.get(key);
      if(!deck){deck={remaining:[],last:null};this.phraseDecks.set(key,deck);}
      if(!deck.remaining.length){
        const shuffled=[...paths];
        for(let i=shuffled.length-1;i>0;i--){
          const j=Math.min(i,Math.floor(Math.max(0,this.random())*(i+1)));
          [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
        }
        if(shuffled.length>1&&shuffled[0]===deck.last)
          [shuffled[0],shuffled[1]]=[shuffled[1],shuffled[0]];
        deck.remaining=shuffled;
      }
      const chosen=deck.remaining[0];
      return {path:chosen,consume:()=>{
        // A pending/failed audio fetch must not spend the next phrase, and
        // two overlapping requests may never consume each other's turn.
        if(deck.remaining[0]===chosen)deck.last=deck.remaining.shift();
      }};
    }
    forgetUnit(unitId){
      // Units receive monotonically increasing IDs during a match. Once an
      // actor dies, keeping its shuffled voice decks cannot affect playback.
      const suffix=':'+unitId;
      for(const key of this.phraseDecks.keys())
        if(key.endsWith(suffix))this.phraseDecks.delete(key);
    }
    // Original layered hammer impact: deep wooden strike, a ringing steel
    // overtone and a short noisy contact. Generated once per AudioContext,
    // without downloads or the old, thin repeating MP3 sample.
    makeHammerBuffer(){
      const rate=this.context.sampleRate||44100,length=Math.ceil(rate*.3);
      const buffer=this.context.createBuffer(2,length,rate);
      let seed=0x5fb827a3;
      for(let i=0;i<length;i++){
        const t=i/rate,env=Math.min(1,t*1800);
        seed=(1664525*seed+1013904223)>>>0;
        const noise=(seed/2147483648-1)*Math.exp(-t*88);
        const body=Math.sin(2*Math.PI*(185*t-95*t*t))*.43*Math.exp(-t*27);
        const metal=Math.sin(2*Math.PI*(795*t+170*t*t))*.31*Math.exp(-t*16);
        const chime=Math.sin(2*Math.PI*1490*t)*.13*Math.exp(-t*35);
        for(let channel=0;channel<2;channel++){
          const sample=body+metal*(channel===0?1:.94)+
            chime*(channel===0?.9:1)+noise*.16;
          buffer.getChannelData(channel)[i]=sample*env;
        }
      }
      return buffer;
    }
    playHammer(canHear=()=>true){
      if(!this.categories.includes('work')||!this.canPlay(canHear))return false;
      const now=this.now(),last=this.lastTime.get('work')??-Infinity;
      if(now-last<MIX.work.cooldown){this.stats.cooldownBlocked++;return false;}
      if(this.active.size>=this.maxActive)return false;
      if(typeof this.context.createBuffer!=='function')return this.play('work',canHear);
      try{
        if(!this.hammerBuffer)this.hammerBuffer=this.makeHammerBuffer();
        const source=this.context.createBufferSource(),gain=this.context.createGain();
        source.buffer=this.hammerBuffer;
        source.playbackRate.value=.92+this.random()*.18;
        gain.gain.value=.30;
        source.connect(gain);gain.connect(this.context.destination);
        const voice={source,gain};this.active.add(voice);
        source.onended=()=>{
          this.active.delete(voice);source.disconnect();gain.disconnect();
        };
        source.start();this.lastTime.set('work',now);this.stats.played++;
        return true;
      }catch(error){
        this.lastError='Hammer synthesis: '+String(error);
        return false;
      }
    }
    // A unit may request its own licensed recording. The path must already be
    // in the manifest: never let a caller construct an arbitrary fetch URL.
    async play(category,canHear=()=>true,options={}){
      if(!this.categories.includes(category))return false;
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
      if(!groups||!this.canPlay(canHear))return false;
      if(this.active.size>=this.maxActive)return false;
      // A character's role is resolved against the verified manifest, never
      // interpolated into a URL. Missing roles are silent, not another voice.
      const voiceRole=typeof options.voice==='string'?options.voice:null;
      const paths=voiceRole?this.voices[category]?.[voiceRole]:groups[category];
      if(!paths?.length)return false;
      // A role is a consistent voice identity; each unit rotates the distinct
      // sentences of that role/event without immediately repeating a phrase.
      // Explicit variants remain available for auditions and compatibility.
      const variant=Number.isInteger(options.variant)?options.variant:null;
      if(variant!==null&&(variant<1||variant>paths.length))return false;
      const pinned=typeof options.path==='string'&&paths.includes(options.path)?
        options.path:variant===null?null:paths[variant-1];
      const historyKey=voiceRole?category+':'+voiceRole:category;
      const previous=this.lastSound.get(historyKey);
      const unitId=Number.isInteger(options.unitId)&&options.unitId>=0?
        options.unitId:null;
      const phrase=unitId!==null&&!pinned?
        this.phraseFor(unitId,category,voiceRole,paths):null;
      const available=pinned?[pinned]:phrase?[phrase.path]:paths.length>1?
        paths.filter(path=>path!==previous):paths;
      const path=available[Math.min(available.length-1,
        Math.floor(Math.max(0,this.random())*available.length))];
      if(!path)return false;
      const generation=this.generation;
      const buffer=await this.bufferFor(path);
      if(!buffer||generation!==this.generation||
        this.now()-requestedAt>1800||!this.canPlay(canHear)||
        this.active.size>=this.maxActive)return false;
      const source=this.context.createBufferSource();
      const gain=this.context.createGain();
      source.buffer=buffer;gain.gain.value=MIX[category].gain;
      if(Number.isFinite(options.playbackRate))
        source.playbackRate.value=Math.max(.88,Math.min(1.12,options.playbackRate));
      if(source.detune&&Number.isFinite(options.detuneCents))
        source.detune.value=Math.max(-100,Math.min(100,options.detuneCents));
      source.connect(gain);gain.connect(this.context.destination);
      const voice={source,gain};
      this.active.add(voice);
      source.onended=()=>{
        this.active.delete(voice);
        source.disconnect();gain.disconnect();
      };
      try{
        source.start();
        phrase?.consume();
        this.lastSound.set(historyKey,path);
        this.lastTime.set(category,this.now());
        this.stats.played++;
        return true;
      }catch(error){
        source.onended=null;this.active.delete(voice);
        source.disconnect();gain.disconnect();
        return false;
      }
    }
    snapshot(){
      return {available:Object.fromEntries(this.categories.map(type=>
        [type,this.catalog[type].length])),
        active:this.active.size,cached:this.cache.size,pending:this.pending.size,
        paused:this.paused,contextState:this.context?.state||'locked',
        hammerSynthReady:!!this.hammerBuffer,
        lastError:this.lastError,...this.stats};
    }
  }
  return {Engine};
});
