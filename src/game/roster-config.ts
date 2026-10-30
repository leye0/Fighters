import type {
  FighterDefinition, StageDefinition,
} from "../engine/simulation.ts";
import { MOVE_CATALOG } from "./move-catalog.ts";

/**
 * Simulation-only benchmark fighter. Never load this synthetic 71-move set into
 * the production UI: production fighters use animationBackedFighter(), whose
 * commands and hit windows come from real reviewed clips.
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
