// Explicit scenario setup: matches themselves start with only a barrack.
// Tests for secondary buildings construct their own examples on valid terrain.
export async function addOrcBuilding(evaluate,type){
  return evaluate("(()=>{const q=window.__fightersQA,type="+JSON.stringify(type)+";"+
    "const sites=[{x:22,z:21},{x:16,z:13},{x:23,z:13}];"+
    "for(let z=8;z<=29;z+=.75)for(let x=6;x<=29;x+=.75)sites.push({x,z});"+
    "for(const {x,z} of sites){if(!q.canBuild(x,z,type))continue;"+
    "const building=q.build(type,x,z);if(building)return {id:building.id,x,z};}"+
    "return null})()");
}
