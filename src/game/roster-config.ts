import type {
  FighterDefinition, MoveDefinition, StageDefinition,
} from "../engine/simulation.ts";

/**
 * Shared baseline authored as data. This is not a completed character move set:
 * per-fighter normals, specials, animation timings and balancing will replace
 * or extend the values once legally cleared characters are available.
 */
const MOVES: readonly MoveDefinition[] = [
  { id:"jab", button:"LP", startupTicks:4, activeTicks:2, recoveryTicks:8, damage:6, chipDamage:0, rangeMm:950, maxTargetHeightMm:1450, level:"mid", hitstunTicks:10, blockstunTicks:7, pushbackMm:80 },
  { id:"straight", button:"MP", startupTicks:6, activeTicks:3, recoveryTicks:11, damage:9, chipDamage:0, rangeMm:1050, maxTargetHeightMm:1600, level:"mid", hitstunTicks:12, blockstunTicks:9, pushbackMm:115 },
  { id:"hook", button:"HP", startupTicks:10, activeTicks:3, recoveryTicks:18, damage:14, chipDamage:1, rangeMm:980, maxTargetHeightMm:1600, level:"mid", hitstunTicks:16, blockstunTicks:12, pushbackMm:175 },
  { id:"low-kick", button:"LK", startupTicks:5, activeTicks:3, recoveryTicks:10, damage:5, chipDamage:0, rangeMm:1120, maxTargetHeightMm:250, level:"low", hitstunTicks:9, blockstunTicks:7, pushbackMm:80 },
  { id:"round-kick", button:"MK", startupTicks:8, activeTicks:3, recoveryTicks:14, damage:10, chipDamage:0, rangeMm:1370, maxTargetHeightMm:1500, level:"mid", hitstunTicks:13, blockstunTicks:9, pushbackMm:125 },
  { id:"high-kick", button:"HK", startupTicks:13, activeTicks:4, recoveryTicks:20, damage:17, chipDamage:1, rangeMm:1450, maxTargetHeightMm:2000, level:"overhead", hitstunTicks:19, blockstunTicks:14, pushbackMm:225 },
  // Data-driven command specials; geometry and animation are sourced separately.
  { id:"surge-punch", button:"MP", motion:"quarter-circle-forward", startupTicks:8, activeTicks:4, recoveryTicks:20, damage:16, chipDamage:2, rangeMm:1600, maxTargetHeightMm:1500, level:"mid", hitstunTicks:19, blockstunTicks:12, pushbackMm:230 },
  { id:"rising-uppercut", button:"HP", motion:"dragon-punch", commandPriority:10, startupTicks:5, activeTicks:5, recoveryTicks:26, damage:22, chipDamage:2, rangeMm:1250, maxTargetHeightMm:2600, level:"mid", hitstunTicks:24, blockstunTicks:15, pushbackMm:295 },
];

export const DEFAULT_STAGE: StageDefinition = {
  leftMm:-6000, rightMm:6000, spawnDistanceMm:2800,
};

export function fighterDefinition(id: string): FighterDefinition {
  return {
    id, maxHealth:100, walkSpeedMmPerTick:62,
    jumpSpeedMmPerTick:165, gravityMmPerTick2:15,
    pushboxHalfWidthMm:285, moves:MOVES,
  };
}
