/* Spatial game SFX, independent of dialogue. All recordings are bundled CC0
 * assets; the airy magic launch is synthesized once per variant. No per-unit
 * audio elements, unbounded buffers, or network calls after cache warm-up.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersEffects=api;
})(typeof globalThis==='object'?globalThis:this,function(root){
  'use strict';
  const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const EFFECTS=Object.freeze({
    hammer:{files:4,gain:.36,cooldown:260,limit:2,priority:2},
    mine:{files:4,gain:.30,cooldown:300,limit:2,priority:2},
    swordSwing:{files:2,gain:.30,cooldown:115,limit:4,priority:4},
    swordHit:{files:4,gain:.43,cooldown:110,limit:5,priority:5},
    magic:{files:4,gain:.50,cooldown:130,limit:5,priority:5},
    garden:{files:4,gain:.23,cooldown:600,limit:2,priority:1},
    wing:{files:2,gain:.36,cooldown:330,limit:2,priority:2},
    caw:{files:3,gain:.56,cooldown:1000,limit:2,priority:3}
  });
  const PATHS=Object.freeze({
    hammer:Array.from({length:4},(_,i)=>`hammer/${i+1}.ogg`),
    mine:Array.from({length:4},(_,i)=>`mine/${i+1}.ogg`),
    swordSwing:['sword/swing-1.ogg','sword/swing-2.ogg'],
    swordHit:Array.from({length:4},(_,i)=>`sword/hit-${i+1}.ogg`),
    magic:['magic/0','magic/1','magic/2','magic/3'],
    garden:Array.from({length:4},(_,i)=>`garden/${i+1}.ogg`),
    wing:['raven/wings.wav','raven/flutter.wav'],
    caw:['raven/caw-original.wav','raven/caw-soft.wav','raven/caw-dark.wav']
  });
  class Engine{
    constructor({fetcher,contextFactory,listener,now,random,
      rootUrl='./sounds/effects/',assetVersion='immersive-20261106',
      maxActive=12,maxCached=24,maxPending=4}={}){
      this.fetcher=fetcher||((url,opts)=>root.fetch(url,opts));
      this.contextFactory=contextFactory||(()=>new (root.AudioContext||root.webkitAudioContext)());
      this.listener=listener||(()=>({x:0,z:0}));
      this.now=now||(()=>Date.now());this.random=random||Math.random;
      this.rootUrl=rootUrl;this.assetVersion=assetVersion;
      this.maxActive=maxActive;this.maxCached=maxCached;this.maxPending=maxPending;
      this.context=null;this.master=null;this.echoDelay=null;
      this.cache=new Map();this.levels=new Map();
      this.pending=new Map();this.controllers=new Set();
      this.active=new Set();this.lastTime=new Map();this.lastPath=new Map();
      this.generation=0;this.paused=false;this.lastSpatialUpdate=-Infinity;
      this.stats={played:0,loadErrors:0,throttled:0,distanceBlocked:0,
        visibilityBlocked:0,voiceStolen:0};
    }
    unlock(){
      try{
        if(!this.context){
          this.context=this.contextFactory();
          if(!this.context)throw Error('No shared AudioContext');
          this.master=this.context.createGain();this.master.gain.value=.80;
          this.master.connect(this.context.destination);
          if(this.context.createDelay&&this.context.createBiquadFilter){
            // One quiet, filtered echo bus for the whole world, not one
            // delay/reverb graph per raven or per cry.
            const delay=this.context.createDelay(.6),filter=this.context.createBiquadFilter();
            const feedback=this.context.createGain();
            delay.delayTime.value=.21;filter.type='lowpass';filter.frequency.value=1550;
            feedback.gain.value=.19;
            delay.connect(filter);filter.connect(this.master);
            filter.connect(feedback);feedback.connect(delay);
            this.echoDelay=delay;
          }
        }
        this.paused=false;
        void this.warmup();
        return true;
      }catch(error){this.lastError=String(error);return false;}
    }
    setPaused(value){this.paused=!!value;}
    reset(){
      this.generation++;
      for(const controller of this.controllers)controller.abort();
      this.controllers.clear();this.pending.clear();
      for(const voice of [...this.active])this.release(voice,true);
      this.lastTime.clear();this.lastPath.clear();this.lastSpatialUpdate=-Infinity;
    }
    release(voice,stop=false){
      if(!this.active.delete(voice))return;
      voice.source.onended=null;
      if(stop)try{voice.source.stop();}catch(_){}
      for(const node of voice.nodes)try{node.disconnect();}catch(_){}
    }
    canHear(audible){
      if(!this.context||this.paused||this.context.state!=='running')return false;
      try{return typeof audible!=='function'||!!audible();}catch(_){return false;}
    }
    positionOf(position){
      try{const p=typeof position==='function'?position():position;
        return p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?p:null;
      }catch(_){return null;}
    }
    spatial(position){
      const p=this.positionOf(position),listener=this.listener();
      if(!p||!listener)return {gain:0,pan:0,echo:0};
      const dx=p.x-number(listener.x,0),dz=p.z-number(listener.z,0);
      const distance=Math.hypot(dx,dz);
      if(distance>=35)return {gain:0,pan:0,echo:0};
      const gain=1/(1+Math.pow(distance/12,1.9));
      return {gain,pan:clamp(dx/19,-.85,.85),
        echo:clamp((distance-7)/24,0,1)*.55};
    }
    magicBuffer(index){
      const ctx=this.context,rate=ctx.sampleRate||44100;
      const duration=.44+index*.055,length=Math.ceil(duration*rate);
      const buffer=ctx.createBuffer(2,length,rate);
      let seed=(0x95164d+index*1299721)>>>0;
      for(let channel=0;channel<2;channel++){
        const data=buffer.getChannelData(channel);
        let low=0,veryLow=0;
        for(let i=0;i<length;i++){
          const t=i/rate,progress=t/duration;
          seed=(1664525*seed+1013904223)>>>0;
          const white=seed/2147483648-1;
          // Broad, airy 'zouffff': wind resonance and a soft falling pitch,
          // with a quick attack, no piercing laser beep or sharp digital edge.
          const cutoff=clamp(1350+900*Math.sin(Math.PI*progress)+index*100,400,3200);
          const alpha=1-Math.exp(-2*Math.PI*cutoff/rate);
          low+=alpha*(white-low);veryLow+=.015*(low-veryLow);
          const air=(low-veryLow)*.88;
          const freq=490*(1-progress)**1.7+115+index*19;
          const tone=Math.sin(2*Math.PI*(115*t+375*duration*(1-Math.pow(1-progress,2.5))/2.5));
          const env=Math.min(1,t*75)*Math.pow(1-progress,1.45);
          const swell=Math.sin(Math.PI*progress)**.65;
          data[i]=clamp((air*.56+tone*.14+Math.sin(2*Math.PI*freq*t)*.035)*
            env*(.65+.35*swell)*(channel===0?1:.95),-.95,.95);
        }
      }
      return buffer;
    }
    async bufferFor(path){
      if(this.cache.has(path)){
        const found=this.cache.get(path);this.cache.delete(path);this.cache.set(path,found);
        return found;
      }
      if(path.startsWith('magic/')){
        if(typeof this.context.createBuffer!=='function')return null;
        const buffer=this.magicBuffer(Number(path.slice(6)));
        this.remember(path,buffer);return buffer;
      }
      if(this.pending.has(path))return this.pending.get(path);
      if(this.pending.size>=this.maxPending)return null;
      const generation=this.generation,controller=new AbortController();
      this.controllers.add(controller);
      const task=(async()=>{
        const timer=setTimeout(()=>controller.abort(),5500);
        try{
          const response=await this.fetcher(this.rootUrl+path+'?v='+this.assetVersion,
            {signal:controller.signal});
          if(!response.ok)throw Error('SFX HTTP '+response.status);
          const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
          if(generation!==this.generation)return null;
          this.remember(path,buffer);return buffer;
        }catch(error){
          if(generation===this.generation){this.stats.loadErrors++;this.lastError=String(error);}
          return null;
        }finally{clearTimeout(timer);this.controllers.delete(controller);}
      })();
      this.pending.set(path,task);
      try{return await task;}finally{if(this.pending.get(path)===task)this.pending.delete(path);}
    }
    remember(path,buffer){
      this.cache.set(path,buffer);
      // The CC0 recordings were mastered at different levels. Measure only
      // on first decode, cap the makeup gain, and leave the waveform intact.
      let peak=0;
      if(typeof buffer.getChannelData==='function'){
        const samples=buffer.getChannelData(0);
        for(let i=0;i<samples.length;i+=4)peak=Math.max(peak,Math.abs(samples[i]));
      }
      this.levels.set(path,peak>.001?clamp(.42/peak,.55,12):1);
      while(this.cache.size>this.maxCached){
        const oldest=this.cache.keys().next().value;
        this.cache.delete(oldest);this.levels.delete(oldest);
      }
    }
    async warmup(){
      const generation=this.generation;
      // A few small, common clips first; bounded concurrency and cached across
      // games. Missing assets never prevent the battle from starting.
      const paths=['hammer/1.ogg','sword/hit-1.ogg','sword/swing-1.ogg',
        'mine/1.ogg','magic/0','garden/1.ogg','raven/wings.wav','raven/caw-original.wav'];
      let next=0;
      await Promise.all(Array.from({length:2},async()=>{
        while(next<paths.length&&this.generation===generation)
          await this.bufferFor(paths[next++]);
      }));
    }
    async play(type,position,audible=()=>true,{rate=1}={}){
      const config=EFFECTS[type];if(!config||!this.canHear(audible))return false;
      const spatial=this.spatial(position);
      if(spatial.gain<.055){this.stats.distanceBlocked++;return false;}
      const time=this.now();
      if(time-(this.lastTime.get(type)??-Infinity)<config.cooldown){
        this.stats.throttled++;return false;
      }
      if([...this.active].filter(v=>v.type===type).length>=config.limit)return false;
      const paths=PATHS[type],previous=this.lastPath.get(type);
      const choices=paths.length>1?paths.filter(p=>p!==previous):paths;
      const path=choices[Math.floor(clamp(this.random(),0,.999999)*choices.length)];
      const generation=this.generation,buffer=await this.bufferFor(path);
      if(!buffer||generation!==this.generation||this.now()-time>850||
        !this.canHear(audible)){
        if(!this.canHear(audible))this.stats.visibilityBlocked++;
        return false;
      }
      const latest=this.spatial(position);
      if(latest.gain<.055)return false;
      if(this.now()-(this.lastTime.get(type)??-Infinity)<config.cooldown)return false;
      if([...this.active].filter(v=>v.type===type).length>=config.limit)return false;
      if(this.active.size>=this.maxActive){
        const candidate=[...this.active].sort((a,b)=>a.priority-b.priority||a.started-b.started)[0];
        if(!candidate||candidate.priority>=config.priority)return false;
        this.release(candidate,true);this.stats.voiceStolen++;
      }
      let source,gain,pan,send;
      try{
        source=this.context.createBufferSource();source.buffer=buffer;
        source.playbackRate.value=clamp(rate*(.955+this.random()*.09),.83,1.18);
        const baseGain=config.gain*(this.levels.get(path)||1);
        gain=this.context.createGain();gain.gain.value=latest.gain*baseGain;
        source.connect(gain);
        const nodes=[source,gain];
        if(this.context.createStereoPanner){
          pan=this.context.createStereoPanner();pan.pan.value=latest.pan;
          gain.connect(pan);pan.connect(this.master);nodes.push(pan);
        }else gain.connect(this.master);
        if(type==='caw'&&this.echoDelay){
          send=this.context.createGain();send.gain.value=latest.echo*baseGain;
          gain.connect(send);send.connect(this.echoDelay);nodes.push(send);
        }
        const voice={type,priority:config.priority,source,gain,pan,send,nodes,
          position,started:this.now(),baseGain};
        source.onended=()=>this.release(voice);
        source.start();this.active.add(voice);
        this.lastPath.set(type,path);this.lastTime.set(type,this.now());this.stats.played++;
        return true;
      }catch(error){
        this.lastError=String(error);
        for(const node of [source,gain,pan,send])try{node?.disconnect();}catch(_){}
        return false;
      }
    }
    update(){
      const now=this.now();if(now-this.lastSpatialUpdate<100)return;
      this.lastSpatialUpdate=now;
      for(const voice of [...this.active]){
        const spatial=this.spatial(voice.position);
        if(spatial.gain<.02){this.release(voice,true);continue;}
        const smooth=(param,value)=>{
          if(param?.setTargetAtTime)param.setTargetAtTime(value,this.context.currentTime,.055);
          else if(param)param.value=value;
        };
        smooth(voice.gain.gain,spatial.gain*voice.baseGain);
        if(voice.pan)smooth(voice.pan.pan,spatial.pan);
        if(voice.send)smooth(voice.send.gain,spatial.echo*voice.baseGain);
      }
    }
    snapshot(){return {active:this.active.size,cached:this.cache.size,
      pending:this.pending.size,paused:this.paused,
      contextState:this.context?.state||'locked',lastError:this.lastError||null,
      ...this.stats};}
  }
  return {Engine,EFFECTS,PATHS};
});
