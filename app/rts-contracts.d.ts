/** Shared RTS domain shapes; no dependency on Three.js, DOM or rendering. */
export type Faction = 'witch' | 'orc';
export type BuildingClan = 'witch' | 'orcs' | 'neutral';
export type Role = 'worker' | 'melee' | 'ranged';
export type BuildingType = 'witch-house' | 'garden' | 'stone-circle' | 'wall' |
  'barrack' | 'hut' | 'mine' | 'cauldron' | 'factory';

export interface Point2D { x: number; z: number }
export interface Position3D extends Point2D { y: number }
export interface UnitRoot { position: Position3D }

export interface Hitbox {
  shape?: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  polygons?: number[][][][];
}

export interface Building {
  id: string;
  type: BuildingType;
  clanId: BuildingClan;
  level: number;
  health: number;
  maxHealth: number;
  destroyed: boolean;
  hitbox: Hitbox;
  root: UnitRoot | null;
  queue: ProductionOrder[];
  progress: number;
  rally?: Point2D;
}

export interface BuildJob {
  type: BuildingType;
  x: number;
  z: number;
  axis?: 'x' | 'z' | null;
  cost: number;
  woodCost: number;
  byAI: boolean;
  progress: number;
  site: { id: string; hitbox: Hitbox };
  preview?: unknown; // Rendering-only object, owned by app/game.js.
}

export interface Unit {
  id: number;
  kind: Faction;
  role: Role;
  root: UnitRoot;
  health: number;
  maxHealth: number;
  dead: boolean;
  destination: Point2D | null;
  attackOrder: Unit | Building | null;
  raiding: boolean;
  constructJob: BuildJob | null;
  repairJob: { buildingId: string } | null;
  mineJob: { mineId: string; phase: string; progress: number; cycles: number; amount: number } | null;
  farmJob: { gardenId: string; plotIndex: number; progress: number; phase: string; amount: number } | null;
  treeJob: { index: number; progress: number; goal: Point2D | null } | null;
  woodJob: { index: number; phase: string; progress: number; amount: number; goal: Point2D | null } | null;
  route: unknown | null; // Navigation-owned route, not a camera or input concern.
}

export type UnitOrder =
  | { type: 'move'; actors: number[]; destination: Point2D }
  | { type: 'attack'; actors: number[]; targetId: number | string }
  | { type: 'repair'; actors: number[]; buildingId: string }
  | { type: 'mine'; actors: number[]; mineId: string }
  | { type: 'collectWood' | 'chop'; actors: number[]; treeIndex: number }
  | { type: 'harvest'; actors: number[]; gardenId: string }
  | { type: 'build'; building: BuildingType; location: Point2D }
  | { type: 'stop'; actors: number[] };

export type ProductionOrder =
  | { kind: Faction; role?: Role; cost?: number }
  | { kind: 'upgrade'; cost?: number };

export interface ResourceStore {
  witch: number;
  orc: number;
}

/** Target aggregate for the progressive GameState migration. The current
 * game still has module-scope variables for some fields; new systems should
 * receive explicit subsets of this contract rather than importing globals. */
export interface GameState {
  ready: boolean;
  running: boolean;
  paused: boolean;
  activeFaction: Faction;
  units: Unit[];
  buildings: Map<string, Building>;
  selected: Set<Unit>;
  selectedBuilding: Building | null;
  gold: ResourceStore;
  wood: ResourceStore;
  magic: ResourceStore;
}
