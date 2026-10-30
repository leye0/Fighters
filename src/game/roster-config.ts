import type {
  FighterDefinition, StageDefinition,
} from "../engine/simulation.ts";
import { MOVE_CATALOG } from "./move-catalog.ts";

/**
 * Shared baseline authored as data. This is not a completed character move set:
 * per-fighter normals, specials, animation timings and balancing will replace
 * or extend the values once legally cleared characters are available.
 */
export const DEFAULT_STAGE: StageDefinition = {
  leftMm:-6000, rightMm:6000, spawnDistanceMm:2800,
};

export function fighterDefinition(id: string): FighterDefinition {
  return {
    id, maxHealth:100, walkSpeedMmPerTick:62,
    jumpSpeedMmPerTick:165, gravityMmPerTick2:15,
    pushboxHalfWidthMm:285, moves:MOVE_CATALOG,
  };
}
