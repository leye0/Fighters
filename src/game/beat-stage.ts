import type { BeatActor, BeatStage } from "../engine/beat-em-up-world.ts";
import type { ScrollBounds, WorldToScreenProjection } from "../render/beat-scroll-camera.ts";

/** Data-only diagnostic level. Geometry is derived from these collision surfaces. */
export const DIAGNOSTIC_STAGE: BeatStage = {
  leftMm: -18000, rightMm: 18000, nearMm: -4500, farMm: 4500,
  gravityMmPerTick2: 19, stepUpMm: 180, stepDownMm: 220,
  movement: { groundAccelerationMmPerTick2: 12, groundBrakingMmPerTick2: 8,
    airAccelerationMmPerTick2: 5, airBrakingMmPerTick2: 3 },
  targetAcquireMm: 2000, targetReleaseMm: 2600, targetMaxHeightMm: 1000,
  platforms: [
    { id: "ground", leftMm: -18000, rightMm: 18000, nearMm: -4500, farMm: 4500, topMm: 0 },
    { id: "block-a", leftMm: -1000, rightMm: 1100, nearMm: -900, farMm: 1000, topMm: 950 },
    { id: "platform-b", leftMm: 2000, rightMm: 9000, nearMm: -2200, farMm: 1700, topMm: 2650, dropThrough: true },
  ],
};

export const BEAT_PROJECTION: WorldToScreenProjection = {
  focusHeightMm: 900,
  depthVerticalNumerator: -1,
  depthVerticalDenominator: 2,
};

/** Camera vertical travel includes depth and the uppermost walkable surface. */
export function diagnosticScrollBounds(
  stage: BeatStage, projection: WorldToScreenProjection,
): ScrollBounds {
  const vertical = (height: number, depth: number) =>
    height + projection.focusHeightMm +
    Math.trunc(depth * projection.depthVerticalNumerator / projection.depthVerticalDenominator);
  const points = [
    vertical(0, stage.nearMm), vertical(0, stage.farMm),
    ...stage.platforms.flatMap(p => [vertical(p.topMm, p.nearMm), vertical(p.topMm, p.farMm)]),
  ];
  return {
    leftMm: stage.leftMm, rightMm: stage.rightMm,
    bottomMm: Math.min(...points), topMm: Math.max(...points),
    // Character feet are lower than the torso focus, and the foreground lane
    // is closer to the camera. Do not pin the *torso* at the bottom pixel.
    bottomCameraInsetMm: 80,
  };
}

export const DIAGNOSTIC_ACTORS: readonly BeatActor[] = [
  {
    id: "hero", team: "heroes", alive: true, xMm: -11000, depthMm: 0,
    heightMm: 0, verticalVelocityMmPerTick: 0, supportingPlatformId: "ground",
    speedMmPerTick: 30, jumpSpeedMmPerTick: 310, facing: 1, targetId: null,
  },
  {
    id: "enemy-a", team: "hostiles", alive: true, xMm: -10100, depthMm: 250,
    heightMm: 0, verticalVelocityMmPerTick: 0, supportingPlatformId: "ground",
    speedMmPerTick: 30, jumpSpeedMmPerTick: 280, facing: -1, targetId: null,
  },
  {
    id: "enemy-b", team: "hostiles", alive: true, xMm: -11900, depthMm: -500,
    heightMm: 0, verticalVelocityMmPerTick: 0, supportingPlatformId: "ground",
    speedMmPerTick: 30, jumpSpeedMmPerTick: 280, facing: -1, targetId: null,
  },
];
