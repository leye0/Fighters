/* Fighters RTS — DOM rendering of resource status and command controls. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FightersHud=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';

  function create({document,getElement}){
    function setText(id,value){
      const element=getElement(id),display=String(value);
      if(element.textContent!==display)element.textContent=display;
    }

    function overview({faction,gold,wood,food,magic,maxMagic,witchCount,orcCount,
      orcHousingCap,orcPopulationCommitted=orcCount,aiEnabled,aiMode}){
      setText('hud-gold',gold);setText('hud-wood',wood);
      setText('hud-food',Math.ceil(food));
      setText('hud-food-label',faction==='witch'?'🌾 VIVRES':'🍖 VIANDE');
      getElement('hud-food-chip').title=faction==='witch'?
        'Blé et baies · consommation des sorcières':
        'Lièvres et dépouilles de sorcières · les orcs mangent moins souvent';
      setText('hud-magic',(Math.round(magic*10)/10)+'/'+maxMagic);
      getElement('hud-magic-fill').style.width=100*magic/maxMagic+'%';
      getElement('hud-magic-chip').title=faction==='witch'?
        'Magie des sorcières · esprits siphonnés et 5 points toutes les 30 secondes':
        'Magie des orcs · récupère 5 points toutes les 30 secondes';
      getElement('hud-gold-chip').title='Or des '+(faction==='witch'?'sorcières':'orcs');
      getElement('hud-wood-chip').title='Bois des '+(faction==='witch'?'sorcières':'orcs');
      setText('hud-units-label',faction==='orc'?'👹 POP.':'⚔️ UNITÉS');
      setText('unit-count',faction==='orc'?orcPopulationCommitted+' / '+orcHousingCap:
        witchCount+' : '+orcCount);
      getElement('hud-units-chip').title='Sorcières : '+witchCount+' · Orcs : '+
        orcPopulationCommitted+' / '+orcHousingCap+
        (orcPopulationCommitted>=orcHousingCap?' · Population pleine : construire ou améliorer une hutte':
          ' · Augmenter la capacité avec des huttes');
      setText('faction-title',faction==='witch'?'SORCIÈRES':'ORCS');
      setText('ai-status',aiEnabled?(faction==='witch'?'ORCS':'SORCIÈRES')+' · '+({
        develop:'Expansion',defend:'Défense',attack:'Assaut',recover:'Regroupement'
      }[aiMode]||'Stratégie'):'IA · En attente');
    }

    function commandButton(parent,symbol,name,cost,action,disabled=false,tooltip=''){
      const element=document.createElement('button');
      element.type='button';element.disabled=!!disabled;
      const price=typeof cost==='object'?
        [cost.gold?cost.gold+'💰':'',cost.wood?cost.wood+'🪵':''].filter(Boolean).join(' '):
        cost?cost+'💰':'';
      const priceLabel=typeof cost==='object'&&cost.magic?cost.magic+'🔮':price;
      element.title=tooltip||name+(priceLabel?' · '+priceLabel:'');
      element.setAttribute('aria-label',element.title);
      for(const [className,text] of [['action-symbol',symbol],['action-name',name],
        ['action-cost',priceLabel]]){
        const span=document.createElement('span');span.className=className;span.textContent=text;
        element.appendChild(span);
      }
      element.onclick=event=>{event.stopPropagation();action();};
      parent.appendChild(element);
      return element;
    }

    function healthTrack(parent,label,width,tone='friendly'){
      const track=document.createElement('div');track.className='hp-track';
      const fill=document.createElement('div');fill.className='hp-fill';
      if(tone!=='friendly')fill.classList.add('hp-'+tone);
      fill.style.width=width+'%';track.appendChild(fill);
      parent.append(document.createTextNode(label),track);
    }

    return Object.freeze({overview,commandButton,healthTrack});
  }
  return Object.freeze({create});
});
