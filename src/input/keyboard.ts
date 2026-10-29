import {
  ATTACK_BUTTONS, normalizeDigitalInput, type DigitalInput,
} from "../engine/commands.ts";
import type { AttackButton, InputFrame } from "../engine/simulation.ts";

interface KeyBindings {
  readonly left: string;
  readonly right: string;
  readonly up: string;
  readonly down: string;
  readonly attacks: Readonly<Record<AttackButton, string>>;
}

export const DEFAULT_BINDINGS: readonly [KeyBindings, KeyBindings] = [
  {
    left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS",
    attacks: { LP: "KeyJ", MP: "KeyK", HP: "KeyL", LK: "KeyU", MK: "KeyI", HK: "KeyO" },
  },
  {
    left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown",
    attacks: { LP: "Numpad1", MP: "Numpad2", HP: "Numpad3", LK: "Numpad4", MK: "Numpad5", HK: "Numpad6" },
  },
];

/**
 * Browser keyboard adapter. Maps physical KeyboardEvent.code to simulation
 * frames; no browser event or render timestamp enters the authoritative core.
 */
export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private readonly bindings: readonly [KeyBindings, KeyBindings];
  private readonly previous: [DigitalInput, DigitalInput];
  private readonly handledCodes: Set<string>;

  constructor(bindings: readonly [KeyBindings, KeyBindings] = DEFAULT_BINDINGS) {
    this.bindings = bindings;
    this.previous = [this.digital(0), this.digital(1)];
    this.handledCodes = new Set(bindings.flatMap(b => [
      b.left, b.right, b.up, b.down, ...Object.values(b.attacks),
    ]));
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  private onDown = (event: KeyboardEvent): void => {
    if (!this.handledCodes.has(event.code) || event.altKey || event.metaKey || event.ctrlKey) return;
    const tag = (event.target as Element | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    event.preventDefault();
    this.pressed.add(event.code);
  };

  private onUp = (event: KeyboardEvent): void => {
    if (this.handledCodes.has(event.code)) {
      event.preventDefault();
      this.pressed.delete(event.code);
    }
  };

  private onBlur = (): void => {
    this.pressed.clear();
    this.previous[0] = this.digital(0);
    this.previous[1] = this.digital(1);
  };

  private digital(index: 0 | 1): DigitalInput {
    const binding = this.bindings[index];
    const result = {
      left: this.pressed.has(binding.left),
      right: this.pressed.has(binding.right),
      up: this.pressed.has(binding.up),
      down: this.pressed.has(binding.down),
    } as Pick<DigitalInput, "left" | "right" | "up" | "down"> & Partial<Record<AttackButton, boolean>>;
    for (const attack of ATTACK_BUTTONS) result[attack] = this.pressed.has(binding.attacks[attack]);
    return result as DigitalInput;
  }

  snapshot(index: 0 | 1): InputFrame {
    const current = this.digital(index);
    const frame = normalizeDigitalInput(current, this.previous[index]);
    this.previous[index] = current;
    return frame;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    this.pressed.clear();
  }
}
