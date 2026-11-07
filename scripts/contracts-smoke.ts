// Compile-time smoke test for the progressive RTS contracts.
// No runtime build or dependencies are added to the playable game.
import type {
  Building,BuildingClan,BuildingType,Faction,GameState,Point2D,
  ProductionOrder,ResourceStore,Role,Unit,UnitOrder
} from '../app/rts-contracts';

const initialResources:ResourceStore={witch:2000,orc:900};
const selectedRole:Role='worker';
const chosenFaction:Faction='witch';
const buildingClan:BuildingClan='orcs';
const buildingType:BuildingType='barrack';
const destination:Point2D={x:3,z:5};

function planMove(unit:Unit):UnitOrder{
  return {type:'move',actors:[unit.id],destination};
}
function queuedProduction(building:Building):ProductionOrder[]{
  return building.queue;
}
function selectedEconomy(state:GameState):number{
  return state.gold[state.activeFaction]+state.wood[state.activeFaction]+
    state.magic[state.activeFaction];
}
function mayRepair(unit:Unit,building:Building):boolean{
  return unit.role===selectedRole&&!unit.dead&&
    (building.clanId===chosenFaction||building.clanId===buildingClan);
}
function queueUpgrade(building:Building):UnitOrder{
  const type:BuildingType=building.type||buildingType;
  return {type:'build',building:type,location:destination};
}

// Referencing all values prevents this test from becoming dead declarations.
export {initialResources,planMove,queuedProduction,selectedEconomy,
  mayRepair,queueUpgrade};
