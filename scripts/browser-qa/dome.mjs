export async function runDomeQa({evaluate,call,check,until,errors}){
 let s;
   const qa='window.__fightersQA';
   // Unlock the actual audio bus using the browser's trusted pointer event.
   await evaluate("document.querySelector('#overlay').hidden=false");
   const rect=await evaluate("(()=>{const r=document.querySelector('#start').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
   await call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
   await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
   await until(`${qa}.effects().contextState==='running'`,'spell audio unlocked',10000);
   check(await evaluate(`${qa}.setMagic(100)&&!${qa}.castDome()`),
     'A level-one house must not cast the spell even with full magic');
   check(await evaluate(`${qa}.upgradeHouse()&&${qa}.upgradeHouse()`),
     'Two house upgrades must be queued');
   await evaluate(`${qa}.advance(23)`);
   s=await evaluate(`${qa}.snapshot()`);
   check(s.house.level===3&&s.souls.magic===100,
     'House must be level 3 with 100 magic before casting');
   await evaluate(`${qa}.selectHouse()`);
   check(await evaluate("Array.from(document.querySelectorAll('#command-buttons button')).some(b=>b.textContent.includes('Dôme arcanique')&&!b.disabled)"),
     'A ready dome button must appear for the upgraded selected house');
   const target=await evaluate(`(()=>{const q=${qa},h=q.snapshot().house.hitbox;
     const x=(h.minX+h.maxX)/2,z=(h.minZ+h.maxZ)/2;
     for(const r of [9,10,12,14])for(let a=0;a<32;a++){
       const p={x:x+r*Math.cos(a*Math.PI/16),z:z+r*Math.sin(a*Math.PI/16)};
       if(q.isClear(p.x,p.z))return p;
     }return null;})()`);
   check(target,'A clear target position must exist within the 20-unit dome');
   check(await evaluate(`${qa}.moveUnitTo('orc',0,${target.x},${target.z})`),
     'Move an enemy inside the dome for the combat test');
   const outside=await evaluate(`${qa}.snapshot().orcs[1].id`);
   check(await evaluate("(()=>{const b=Array.from(document.querySelectorAll('#command-buttons button')).find(b=>b.textContent.includes('Dôme arcanique'));b?.click();return true;})()"),
     'Spell command should respond to a click');
   s=await evaluate(`${qa}.snapshot()`);
   check(s.dome.active&&s.souls.magic<1&&s.dome.maxRadius===20,
     'Dome must activate and immediately spend 100 magic');
   await evaluate(`${qa}.advance(2)`);
   s=await evaluate(`${qa}.snapshot()`);
   check(s.orcs.some(u=>u.id===outside)&&s.orcs.length===3,
     'Only the enemy inside the sphere should be pulverized: '+JSON.stringify(s.orcs));
   check(s.dome.radius===20&&s.dome.active,
     'Dome reaches full radius and remains visible briefly');
   await evaluate(`${qa}.advance(2)`);
   check(!await evaluate(`${qa}.snapshot().dome.active`),
     'Dome geometry must disappear and be released after 3.2 seconds');
   check(!errors.length,'Browser exceptions: '+errors.join(' | '));
   console.log('PASS WITCH DOME BROWSER: level, magic, UI, radius, enemy cleanup');
   return;
}
