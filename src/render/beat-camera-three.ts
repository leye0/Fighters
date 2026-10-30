import { PerspectiveCamera } from "three";
import { followBeatCamera, projectBeatFocus, type ScrollBounds,
  type ScrollCameraFrame, type WorldToScreenProjection } from "./beat-scroll-camera.ts";

// tan(pitch) = 1/2; matches projectBeatFocus's -depth/2 exactly.
const CAMERA_DEPTH_METERS = 8;
const CAMERA_RISE_METERS = 4;
const CAMERA_DISTANCE = Math.hypot(CAMERA_DEPTH_METERS, CAMERA_RISE_METERS);
const CAMERA_UP_COSINE = CAMERA_DEPTH_METERS / CAMERA_DISTANCE;

export function makeBeatCamera(aspect = 16 / 9): PerspectiveCamera {
  return new PerspectiveCamera(29, aspect, 0.05, 150);
}

/** Visible extents on the fixed Z=0 scrolling plane, accounting for pitch. */
export function beatCameraViewport(camera: PerspectiveCamera) {
  const halfHeight = CAMERA_DISTANCE * Math.tan(camera.fov * Math.PI / 360);
  return {
    widthMm: Math.max(1, Math.round(halfHeight * 2 * camera.aspect * 1000)),
    heightMm: Math.max(1, Math.round(halfHeight * 2 / CAMERA_UP_COSINE * 1000)),
  };
}

/** Follow the real 3D focus, without smoothing or legacy two-fighter framing. */
export function placeBeatCamera(
  camera: PerspectiveCamera,
  focus: Readonly<{ xMm: number; depthMm: number; heightMm: number }>,
  projection: WorldToScreenProjection, bounds: ScrollBounds,
): ScrollCameraFrame {
  if (projection.depthVerticalNumerator * 2 !== -projection.depthVerticalDenominator) {
    throw new Error("Camera pitch and logical depth projection must agree");
  }
  const hero = projectBeatFocus(focus, projection);
  const frame = followBeatCamera(hero, bounds, beatCameraViewport(camera));
  const x = frame.center.xMm / 1000;
  const y = frame.center.verticalMm / 1000;
  camera.position.set(x, y + CAMERA_RISE_METERS, CAMERA_DEPTH_METERS);
  camera.lookAt(x, y, 0);
  camera.updateMatrixWorld();
  return frame;
}
