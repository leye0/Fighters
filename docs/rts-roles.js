/* Fighters RTS — one female or male rig per clan, three gameplay roles.
 * Role identity is data; do not introduce per-role GLBs or animation clips.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersRoles=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const ROLE_IDS=Object.freeze(['worker','melee','ranged']);
  const DEFINITIONS=Object.freeze({
    witch:Object.freeze({
      worker:Object.freeze({name:'Ouvrière',icon:'🧹',cost:75,health:70,speed:3.35,damage:0,range:0,sight:0,garment:0x9b8256}),
      melee:Object.freeze({name:'Garde',icon:'⚔️',cost:120,health:85,speed:3.3,damage:17,range:1.65,sight:7.5,garment:0x9c507e}),
      ranged:Object.freeze({name:'Arcaniste',icon:'✨',cost:150,health:65,speed:3.05,damage:12,range:6.2,sight:9,garment:0x557ac4})
    }),
    orc:Object.freeze({
      worker:Object.freeze({name:'Ouvrier',icon:'⛏️',cost:65,health:80,speed:2.9,damage:0,range:0,sight:0,garment:0x978251}),
      melee:Object.freeze({name:'Guerrier',icon:'🗡️',cost:100,health:110,speed:2.75,damage:14,range:2.1,sight:9,garment:0xb45e47}),
      ranged:Object.freeze({name:'Lanceur',icon:'🎯',cost:130,health:78,speed:2.7,damage:10,range:6.2,sight:10,garment:0x668d65})
    })
  });
  function profile(clan,role){
    const value=DEFINITIONS[clan]?.[role];
    if(!value)throw Error('Unknown Fighters role: '+clan+'/'+role);
    return value;
  }
  const isWorker=unit=>unit?.role==='worker';
  const isFighter=unit=>unit?.role==='melee'||unit?.role==='ranged';
  return {ROLE_IDS,DEFINITIONS,profile,isWorker,isFighter};
});
