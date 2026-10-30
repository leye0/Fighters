import type { AttackButton, Direction, Facing, InputFrame } from "./simulation.ts";

export const ATTACK_BUTTONS: readonly AttackButton[] = ["LP", "MP", "HP", "LK", "MK", "HK"];
export type DirectionCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MotionName = "quarter-circle-forward" | "quarter-circle-back" |
  "dragon-punch" | "reverse-dragon-punch" |
  "half-circle-forward" | "half-circle-back" |
  "double-quarter-circle-forward" | "double-quarter-circle-back" | "full-circle";

export interface DigitalInput {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly LP: boolean;
  readonly MP: boolean;
  readonly HP: boolean;
  readonly LK: boolean;
  readonly MK: boolean;
  readonly HK: boolean;
}

export interface MotionSample {
  readonly tick: number;
  readonly direction: DirectionCode;
}

export const MOTIONS: Readonly<Record<MotionName, readonly DirectionCode[]>> = Object.freeze({
  "quarter-circle-forward": [2, 3, 6],
  "quarter-circle-back": [2, 1, 4],
  "dragon-punch": [6, 2, 3],
  "reverse-dragon-punch": [4, 2, 1],
  "half-circle-forward": [4, 1, 2, 3, 6],
  "half-circle-back": [6, 3, 2, 1, 4],
  "double-quarter-circle-forward": [2, 3, 6, 2, 3, 6],
  "double-quarter-circle-back": [2, 1, 4, 2, 1, 4],
  "full-circle": [6, 3, 2, 1, 4, 7],
});

/** Resolve impossible opposing directions to neutral, not whichever key wins. */
export function normalizeDigitalInput(current: DigitalInput, previous: DigitalInput): InputFrame {
  const horizontal = (Number(current.right) - Number(current.left)) as Direction;
  const vertical = (Number(current.up) - Number(current.down)) as Direction;
  const attacks = ATTACK_BUTTONS.filter((button) => current[button] && !previous[button]);
  return { horizontal, vertical, attacks };
}

/** Traditional numpad motion notation, always relative to current facing. */
export function directionCode(input: InputFrame, facing: Facing): DirectionCode {
  const forward = input.horizontal * facing;
  if (input.vertical === -1) return (forward + 2) as DirectionCode; // 1, 2, 3
  if (input.vertical === 1) return (forward + 8) as DirectionCode;  // 7, 8, 9
  return (forward + 5) as DirectionCode; // 4, 5, 6
}

/**
 * Matches a motion through a chronological input history.
 * Duplicated held directions are ignored; extra intermediate directions are
 * tolerated; the last motion direction must be recent enough.
 * Returns false for invalid ordering or incomplete motions.
 */
export function matchesMotion(
  history: readonly MotionSample[],
  pattern: readonly DirectionCode[],
  currentTick: number,
  maxWindowTicks = 16,
  completionGraceTicks = 4,
): boolean {
  if (pattern.length === 0 || history.length === 0) return false;
  if (maxWindowTicks < 0 || completionGraceTicks < 0) return false;
  const recent = history.filter((sample) =>
    Number.isSafeInteger(sample.tick) &&
    sample.tick <= currentTick &&
    sample.tick >= currentTick - maxWindowTicks,
  );
  if (recent.some((sample, i) => i > 0 && sample.tick < recent[i - 1].tick)) return false;
  const unique: MotionSample[] = [];
  for (const sample of recent) {
    if (unique.at(-1)?.direction !== sample.direction) unique.push(sample);
    else unique[unique.length - 1] = sample;
  }
  let index = pattern.length - 1;
  let finishedAt = -1;
  for (let i = unique.length - 1; i >= 0; i--) {
    if (unique[i].direction !== pattern[index]) continue;
    if (finishedAt < 0) finishedAt = unique[i].tick;
    index--;
    if (index < 0) return currentTick - finishedAt <= completionGraceTicks;
  }
  return false;
}
