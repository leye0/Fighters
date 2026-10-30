/** Logical screen-space camera for the 3D side-scrolling beat'em up.
 * The hero stays at the screen centre until a stage edge prevents scrolling.
 * Integer millimetres and an explicit projection keep this deterministic.
 */
export interface ProjectedPoint {
  readonly xMm: number;
  /** Upward-positive coordinate in the camera's scrolling plane. */
  readonly verticalMm: number;
}

export interface WorldToScreenProjection {
  /** Fixed focus point above the character's feet (e.g. torso instead of shoes). */
  readonly focusHeightMm: number;
  /** Oblique 3D view: moving in world depth also moves vertically on screen. */
  readonly depthVerticalNumerator: number;
  readonly depthVerticalDenominator: number;
}

export interface ScrollBounds {
  readonly leftMm: number;
  readonly rightMm: number;
  readonly bottomMm: number;
  readonly topMm: number;
}

export interface CameraViewport {
  /** Visible width/height in logical projected world millimetres, not CSS pixels. */
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface ScrollCameraFrame {
  readonly center: ProjectedPoint;
  /** Hero displacement from centre: exactly zero away from stage borders. */
  readonly heroOffset: ProjectedPoint;
  /** Whether scrolling is blocked by each of the four boundaries. */
  readonly pinned: Readonly<{
    left: boolean;
    right: boolean;
    bottom: boolean;
    top: boolean;
  }>;
}

function check(value: number, name: string, positive = false): void {
  if (!Number.isSafeInteger(value) || (positive && value <= 0)) {
    throw new Error(name + " must be a " + (positive ? "positive " : "") + "safe integer");
  }
}

/** Project the hero's 3D simulation position onto the camera-follow plane.
 * The actual 3D renderer may use perspective, but must map the same logical
 * extents to the viewport when it applies the camera offset.
 */
export function projectBeatFocus(
  actor: Readonly<{ xMm: number; depthMm: number; heightMm: number }>,
  projection: WorldToScreenProjection,
): ProjectedPoint {
  check(actor.xMm, "xMm");
  check(actor.depthMm, "depthMm");
  check(actor.heightMm, "heightMm");
  check(projection.focusHeightMm, "focusHeightMm");
  check(projection.depthVerticalNumerator, "depthVerticalNumerator");
  check(projection.depthVerticalDenominator, "depthVerticalDenominator", true);
  return {
    xMm: actor.xMm,
    verticalMm: actor.heightMm + projection.focusHeightMm +
      Math.trunc(actor.depthMm * projection.depthVerticalNumerator /
        projection.depthVerticalDenominator),
  };
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function followAxis(
  hero: number, min: number, max: number, visible: number,
): { center: number; lower: boolean; upper: boolean } {
  const half = Math.trunc(visible / 2);
  if (max - min <= visible) {
    // A small room cannot scroll: centre the entire room in the viewport.
    return { center: Math.trunc((min + max) / 2), lower: true, upper: true };
  }
  const lowerCenter = min + half;
  const upperCenter = max - (visible - half);
  const center = clamp(hero, lowerCenter, upperCenter);
  return {
    center,
    lower: center === lowerCenter,
    upper: center === upperCenter,
  };
}

/** Fixed camera framing: no dead-zone or smoothing lag can move a free hero
 * away from the centre. Only stage boundaries allow on-screen displacement.
 */
export function followBeatCamera(
  hero: ProjectedPoint, bounds: ScrollBounds, viewport: CameraViewport,
): ScrollCameraFrame {
  for (const [name, value] of Object.entries({ ...hero, ...bounds, ...viewport })) {
    check(value, name);
  }
  if (bounds.leftMm >= bounds.rightMm || bounds.bottomMm >= bounds.topMm) {
    throw new Error("Invalid scrolling bounds");
  }
  check(viewport.widthMm, "viewport.widthMm", true);
  check(viewport.heightMm, "viewport.heightMm", true);
  const horizontal = followAxis(hero.xMm, bounds.leftMm, bounds.rightMm, viewport.widthMm);
  const vertical = followAxis(hero.verticalMm, bounds.bottomMm, bounds.topMm, viewport.heightMm);
  return {
    center: { xMm: horizontal.center, verticalMm: vertical.center },
    heroOffset: {
      xMm: hero.xMm - horizontal.center,
      verticalMm: hero.verticalMm - vertical.center,
    },
    pinned: {
      left: horizontal.lower,
      right: horizontal.upper,
      bottom: vertical.lower,
      top: vertical.upper,
    },
  };
}
