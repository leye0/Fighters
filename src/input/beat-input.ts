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

const keys = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp",
  "KeyA", "KeyD", "KeyW", "KeyS", "Space", "KeyJ", "KeyK", "KeyF", "KeyG", "KeyH"]);
const combatKeys = ["KeyF", "KeyG", "KeyH"] as const;

/** Unified keyboard, touch and gamepad controls for the playable beat'em up. */
export class BeatControls {
  private readonly held = new Set<string>();
  private readonly touch = new Map<number, string>();
  private readonly buttons: HTMLElement[];
  private wasJumping = false;
  private wasDropping = false;
  private queuedCombatGesture: number | null = null;
  private wasGamepadAttacking = false;

  constructor(root: HTMLElement) {
    this.buttons = [...root.querySelectorAll<HTMLElement>("[data-beat-key]")];
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.clear);
    for (const button of this.buttons) {
      button.addEventListener("pointerdown", this.pointerDown);
      button.addEventListener("pointerup", this.pointerEnd);
      button.addEventListener("pointercancel", this.pointerEnd);
      button.addEventListener("lostpointercapture", this.pointerEnd);
    }
  }

  private onDown = (event: KeyboardEvent): void => {
    if (!keys.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as Element | null)?.tagName ?? "")) return;
    event.preventDefault();
    if (!event.repeat && combatKeys.includes(event.code as typeof combatKeys[number]))
      this.queuedCombatGesture = combatKeys.indexOf(event.code as typeof combatKeys[number]);
    this.held.add(event.code);
  };

  private onUp = (event: KeyboardEvent): void => {
    if (keys.has(event.code)) {
      event.preventDefault();
      this.held.delete(event.code);
    }
  };

  private pointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    const button = event.currentTarget as HTMLElement;
    const key = button.dataset.beatKey;
    if (!key) return;
    this.touch.set(event.pointerId, key);
    if (combatKeys.includes(key as typeof combatKeys[number]))
      this.queuedCombatGesture = combatKeys.indexOf(key as typeof combatKeys[number]);
    button.setPointerCapture(event.pointerId);
  };

  private pointerEnd = (event: PointerEvent): void => {
    this.touch.delete(event.pointerId);
  };

  private clear = (): void => {
    this.held.clear();
    this.touch.clear();
    this.wasJumping = false;
    this.wasDropping = false;
    this.wasGamepadAttacking = false;
    this.queuedCombatGesture = null;
  };

  reset(): void { this.clear(); }

  consumeCombatGesture(): number | null {
    const queued = this.queuedCombatGesture;
    this.queuedCombatGesture = null;
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? null;
    const held = [pad?.buttons[2]?.pressed, pad?.buttons[3]?.pressed, pad?.buttons[4]?.pressed];
    const heldNow = held.some(Boolean);
    const triggered = heldNow && !this.wasGamepadAttacking ? held.findIndex(Boolean) : null;
    this.wasGamepadAttacking = heldNow;
    return queued ?? triggered;
  }

  snapshot(): BeatInput {
    const combined = new Set(this.held);
    for (const key of this.touch.values()) combined.add(key);
    const keyInput = digitalBeatInput(combined);
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected) ?? null;
    const gamepadAxis = (value: number): Axis => value > 0.35 ? 1 : value < -0.35 ? -1 : 0;
    const horizontal = keyInput.horizontal || gamepadAxis(pad?.axes[0] ?? 0);
    const depth = keyInput.depth || gamepadAxis(pad?.axes[1] ?? 0);
    const jumpHeld = keyInput.jump || Boolean(pad?.buttons[0]?.pressed);
    const dropHeld = keyInput.drop || Boolean(pad?.buttons[1]?.pressed);
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
    for (const button of this.buttons) {
      button.removeEventListener("pointerdown", this.pointerDown);
      button.removeEventListener("pointerup", this.pointerEnd);
      button.removeEventListener("pointercancel", this.pointerEnd);
      button.removeEventListener("lostpointercapture", this.pointerEnd);
    }
    this.clear();
  }
}
