import type { Axis, BeatInput } from "../engine/beat-em-up-world.ts";

export function digitalBeatInput(held: ReadonlySet<string>): BeatInput {
  const axis = (positive: readonly string[], negative: readonly string[]): Axis => {
    const yes = positive.some(key => held.has(key));
    const no = negative.some(key => held.has(key));
    return Number(yes) - Number(no) as Axis;
  };
  return {
    horizontal: axis(["ArrowRight", "KeyD"], ["ArrowLeft", "KeyA"]),
    depth: axis(["ArrowDown", "KeyS"], ["ArrowUp", "KeyW"]),
    jump: held.has("Space") || held.has("KeyJ"),
    drop: held.has("KeyK"),
  };
}

/** A direction stays engaged until touch release, without a virtual D-pad. */
export function swipeBeatDirection(dx: number, dy: number): Pick<BeatInput, "horizontal" | "depth"> {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 22) return { horizontal: 0, depth: 0 };
  // Use eight directions: allow diagonals without requiring an exact 45° swipe.
  return {
    horizontal: Math.abs(dx) / length >= 0.42 ? Math.sign(dx) as Axis : 0,
    depth: Math.abs(dy) / length >= 0.42 ? Math.sign(dy) as Axis : 0,
  };
}

const keys = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp",
  "KeyA", "KeyD", "KeyW", "KeyS", "Space", "KeyJ", "KeyK", "KeyF", "KeyG", "KeyH", "KeyI"]);
const combatKeys = ["KeyF", "KeyG", "KeyH", "KeyI"] as const;

/** Keyboard/gamepad plus a full left swipe area and a four-zone right strike pad. */
export class BeatControls {
  private readonly held = new Set<string>();
  private readonly steerZone: HTMLElement;
  private readonly actionPad: HTMLElement;
  private readonly jumpButton: HTMLElement;
  private readonly attackButtons: HTMLElement[];
  private readonly attackPointers = new Map<number, number | "jump" | null>();
  private steerPointer: number | null = null;
  private steerOrigin = { x: 0, y: 0 };
  private steering: Pick<BeatInput, "horizontal" | "depth"> = { horizontal: 0, depth: 0 };
  private steerDragged = false;
  private lastSteerTap: { x: number; y: number; time: number } | null = null;
  private touchJumpQueued = false;
  private touchDropQueued = false;
  private wasJumping = false;
  private wasDropping = false;
  private readonly combatQueue: number[] = [];
  private wasGamepadAttacking = false;

  constructor(root: HTMLElement) {
    const steering = root.querySelector<HTMLElement>("#beat-steering-zone");
    const actions = root.querySelector<HTMLElement>("#beat-action-pad");
    if (!steering || !actions) throw new Error("Missing free-swipe or four-strike touch control zones");
    this.steerZone = steering;
    this.actionPad = actions;
    const jump = actions.querySelector<HTMLElement>("#beat-jump-button");
    if (!jump) throw new Error("Central jump zone is missing");
    this.jumpButton = jump;
    this.attackButtons = [...actions.querySelectorAll<HTMLElement>("[data-beat-attack]")];
    if (this.attackButtons.length !== 4) throw new Error("Four genuine strike zones are required");
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.clear);
    this.steerZone.addEventListener("pointerdown", this.steerDown);
    this.steerZone.addEventListener("pointermove", this.steerMove);
    this.steerZone.addEventListener("pointerup", this.steerEnd);
    this.steerZone.addEventListener("pointercancel", this.steerCancel);
    this.steerZone.addEventListener("lostpointercapture", this.steerCancel);
    this.actionPad.addEventListener("pointerdown", this.attackDown);
    this.actionPad.addEventListener("pointermove", this.attackMove);
    this.actionPad.addEventListener("pointerup", this.attackEnd);
    this.actionPad.addEventListener("pointercancel", this.attackEnd);
    this.actionPad.addEventListener("lostpointercapture", this.attackEnd);
  }

  private queueAttack(index: number): void {
    // A fast thumb slide buffers strikes while the previous clip finishes.
    if (this.combatQueue.length === 3) this.combatQueue.shift();
    this.combatQueue.push(index);
  }

  private onDown = (event: KeyboardEvent): void => {
    if (!keys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as Element | null)?.tagName ?? "")) return;
    event.preventDefault();
    if (!event.repeat && combatKeys.includes(event.code as typeof combatKeys[number]))
      this.queueAttack(combatKeys.indexOf(event.code as typeof combatKeys[number]));
    this.held.add(event.code);
  };

  private onUp = (event: KeyboardEvent): void => {
    if (keys.has(event.code)) {
      event.preventDefault();
      this.held.delete(event.code);
    }
  };

  private steerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.steerPointer !== null) {
      // An optional second finger on the left drops through one-way platforms.
      this.touchDropQueued = true;
      return;
    }
    const last = this.lastSteerTap;
    if (last && event.timeStamp - last.time < 300 &&
        Math.hypot(event.clientX - last.x, event.clientY - last.y) < 55) {
      this.touchJumpQueued = true; // Double tap anywhere left to jump, no button.
      this.lastSteerTap = null;
    }
    this.steerPointer = event.pointerId;
    this.steerOrigin = { x: event.clientX, y: event.clientY };
    this.steerDragged = false;
    this.steering = { horizontal: 0, depth: 0 };
    this.steerZone.setPointerCapture(event.pointerId);
  };

  private steerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.steerPointer) return;
    event.preventDefault();
    const dx = event.clientX - this.steerOrigin.x;
    const dy = event.clientY - this.steerOrigin.y;
    this.steering = swipeBeatDirection(dx, dy);
    if (Math.hypot(dx, dy) >= 22) this.steerDragged = true;
  };

  private stopSteering(event: PointerEvent, cancelled: boolean): void {
    if (event.pointerId !== this.steerPointer) return;
    if (!cancelled && !this.steerDragged) {
      this.lastSteerTap = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    } else this.lastSteerTap = null;
    this.steerPointer = null;
    this.steering = { horizontal: 0, depth: 0 };
  }

  private steerEnd = (event: PointerEvent): void => { this.stopSteering(event, false); };
  private steerCancel = (event: PointerEvent): void => { this.stopSteering(event, true); };

  private attackAtPoint(x: number, y: number): number | "jump" | null {
    const jump = this.jumpButton.getBoundingClientRect();
    if (x >= jump.left && x < jump.right && y >= jump.top && y < jump.bottom)
      return "jump";
    const index = this.attackButtons.findIndex(button => {
      const rect = button.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    });
    return index < 0 ? null : index;
  }

  private triggerTouchAction(index: number | "jump" | null): void {
    if (index === "jump") this.touchJumpQueued = true;
    else if (index !== null) this.queueAttack(index);
  }

  private attackDown = (event: PointerEvent): void => {
    event.preventDefault();
    const index = this.attackAtPoint(event.clientX, event.clientY);
    this.attackPointers.set(event.pointerId, index);
    this.triggerTouchAction(index); // Immediate touchdown, including jump.
    this.actionPad.setPointerCapture(event.pointerId);
  };

  private attackMove = (event: PointerEvent): void => {
    if (!this.attackPointers.has(event.pointerId)) return;
    event.preventDefault();
    const index = this.attackAtPoint(event.clientX, event.clientY);
    if (index === this.attackPointers.get(event.pointerId)) return;
    this.attackPointers.set(event.pointerId, index);
    this.triggerTouchAction(index); // Sliding between punches, kicks and jump.
  };

  private attackEnd = (event: PointerEvent): void => { this.attackPointers.delete(event.pointerId); };

  private clear = (): void => {
    this.held.clear();
    this.attackPointers.clear();
    this.steerPointer = null;
    this.steering = { horizontal: 0, depth: 0 };
    this.lastSteerTap = null;
    this.touchJumpQueued = false;
    this.touchDropQueued = false;
    this.wasJumping = false;
    this.wasDropping = false;
    this.wasGamepadAttacking = false;
    this.combatQueue.length = 0;
  };

  reset(): void { this.clear(); }

  consumeCombatGesture(ready = true): number | null {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? null;
    const held = [pad?.buttons[2]?.pressed, pad?.buttons[3]?.pressed,
      pad?.buttons[4]?.pressed, pad?.buttons[5]?.pressed];
    const heldNow = held.some(Boolean);
    if (heldNow && !this.wasGamepadAttacking) this.queueAttack(held.findIndex(Boolean));
    this.wasGamepadAttacking = heldNow;
    return ready ? this.combatQueue.shift() ?? null : null;
  }

  snapshot(): BeatInput {
    const keyInput = digitalBeatInput(this.held);
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? null;
    const gamepadAxis = (value: number): Axis => value > 0.35 ? 1 : value < -0.35 ? -1 : 0;
    const horizontal = keyInput.horizontal || this.steering.horizontal || gamepadAxis(pad?.axes[0] ?? 0);
    const depth = keyInput.depth || this.steering.depth || gamepadAxis(pad?.axes[1] ?? 0);
    const jumpHeld = keyInput.jump || Boolean(pad?.buttons[0]?.pressed) || this.touchJumpQueued;
    const dropHeld = keyInput.drop || Boolean(pad?.buttons[1]?.pressed) || this.touchDropQueued;
    this.touchJumpQueued = false;
    this.touchDropQueued = false;
    const jump = jumpHeld && !this.wasJumping;
    const drop = dropHeld && !this.wasDropping;
    this.wasJumping = jumpHeld;
    this.wasDropping = dropHeld;
    return { horizontal, depth, jump, drop };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.clear);
    this.steerZone.removeEventListener("pointerdown", this.steerDown);
    this.steerZone.removeEventListener("pointermove", this.steerMove);
    this.steerZone.removeEventListener("pointerup", this.steerEnd);
    this.steerZone.removeEventListener("pointercancel", this.steerCancel);
    this.steerZone.removeEventListener("lostpointercapture", this.steerCancel);
    this.actionPad.removeEventListener("pointerdown", this.attackDown);
    this.actionPad.removeEventListener("pointermove", this.attackMove);
    this.actionPad.removeEventListener("pointerup", this.attackEnd);
    this.actionPad.removeEventListener("pointercancel", this.attackEnd);
    this.actionPad.removeEventListener("lostpointercapture", this.attackEnd);
    this.clear();
  }
}
