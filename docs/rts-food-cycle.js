/* Fighters RTS — per-tick food and starvation simulation for both factions.
 * The world and rendering effects are explicitly injected by the composition
 * root. Preserve the original order of forage, food, jobs and famine damage.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersFoodCycle=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({units,hareField,orcFood,orcFoodRules,assignOrcForagers,
    wildBerries,syncBerryVisuals,farming,buildingInstances,syncGardenVisual,
    assignGardenWorkers,assignBerryForagers,witchStarvationDamage,
    showBanner,dealDamage}){
    let orcFamineAlerted=false,witchFamineAlerted=false;
    function reset(){orcFamineAlerted=false;witchFamineAlerted=false;}

    function stepOrcs(dt){
      const orcs=units.filter(u=>u.kind==='orc'&&!u.dead);
      hareField.step(dt,orcs.map(u=>u.root.position));
      const result=orcFood.step(dt,orcs.length);
      assignOrcForagers(dt);
      if(orcFood.food>0)orcFamineAlerted=false;
      else if(!orcFamineAlerted){
        orcFamineAlerted=true;showBanner('FAMINE : LES ORCS PERDENT DES PV');
      }
      if(result.starvedSeconds>0){
        const damage=result.starvedSeconds*orcFoodRules.STARVATION_DAMAGE;
        for(const orc of orcs){
          if(orc.health<=damage)dealDamage(orc,damage,null);
          else orc.health-=damage;
        }
      }
    }

    function stepWitches(dt){
      wildBerries.step(dt);syncBerryVisuals();
      const witches=units.filter(u=>u.kind==='witch'&&!u.dead);
      const result=farming.step(dt,witches.length);
      for(const garden of buildingInstances.values())
        if(garden.type==='garden'&&!garden.destroyed)syncGardenVisual(garden);
      assignGardenWorkers(dt);
      assignBerryForagers(dt);
      if(farming.food>0)witchFamineAlerted=false;
      else if(!witchFamineAlerted){
        witchFamineAlerted=true;showBanner('FAMINE : LES SORCIÈRES PERDENT DES PV');
      }
      if(result.starvedSeconds>0){
        const damage=result.starvedSeconds*witchStarvationDamage;
        for(const witch of witches){
          if(witch.health<=damage)dealDamage(witch,damage,null);
          else witch.health-=damage;
        }
      }
    }

    return Object.freeze({stepOrcs,stepWitches,reset});
  }

  return Object.freeze({create});
});
