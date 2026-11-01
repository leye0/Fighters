import assert from "node:assert/strict";
import test from "node:test";
import { BeatControls } from "../src/input/beat-input.ts";

type Rect = { left: number; right: number; top: number; bottom: number };

class FakeElement {
  readonly listeners = new Map<string, (event: PointerEvent) => void>();
  readonly rect: Rect;
  constructor(rect: Rect = { left: 0, right: 0, top: 0, bottom: 0 }) { this.rect = rect; }
  addEventListener(type: string, handler: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, handler as (event: PointerEvent) => void);
  }
  removeEventListener(type: string): void { this.listeners.delete(type); }
  setPointerCapture(_pointerId: number): void {}
  getBoundingClientRect(): DOMRect { return this.rect as DOMRect; }
  fire(type: string, pointerId: number, clientX: number, clientY: number,
    timeStamp = 10): void {
    const event = { pointerId, clientX, clientY, timeStamp, preventDefault() {} } as PointerEvent;
    this.listeners.get(type)?.(event);
  }
}

test("one thumb swipes freely while the other triggers and slides between four strike zones", () => {
  const steer = new FakeElement();
  const buttons = [
    new FakeElement({ left: 500, right: 600, top: 100, bottom: 200 }),
    new FakeElement({ left: 600, right: 700, top: 100, bottom: 200 }),
    new FakeElement({ left: 500, right: 600, top: 200, bottom: 300 }),
    new FakeElement({ left: 600, right: 700, top: 200, bottom: 300 }),
  ];
  const jump = new FakeElement({ left: 575, right: 625, top: 175, bottom: 225 });
  const pad = Object.assign(new FakeElement(), {
    querySelector: (selector: string) => selector === "#beat-jump-button" ? jump : null,
    querySelectorAll: () => buttons,
  });
  const root = {
    querySelector: (selector: string) => selector === "#beat-steering-zone" ? steer : pad,
  } as unknown as HTMLElement;

  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    addEventListener() {}, removeEventListener() {},
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true,
    value: { getGamepads: () => [] } });
  try {
    const controls = new BeatControls(root);
    steer.fire("pointerdown", 1, 100, 150);
    steer.fire("pointermove", 1, 190, 80);
    assert.deepEqual(controls.snapshot(), { horizontal: 1, depth: -1, jump: false, drop: false });

    pad.fire("pointerdown", 2, 550, 150);
    assert.equal(controls.consumeCombatGesture(), 0, "touchdown fires the first strike");
    pad.fire("pointermove", 2, 650, 150);
    assert.equal(controls.consumeCombatGesture(false), null, "slid strikes buffer during recovery");
    assert.equal(controls.consumeCombatGesture(), 1, "entering CROSS triggers a new attack");
    pad.fire("pointermove", 2, 650, 250);
    assert.equal(controls.consumeCombatGesture(), 3, "moving into ROUNDHOUSE triggers the fourth attack");
    pad.fire("pointermove", 2, 650, 250);
    assert.equal(controls.consumeCombatGesture(), null, "remaining in one zone does not spam attacks");
    pad.fire("pointerup", 2, 650, 250);

    assert.equal(controls.snapshot().horizontal, 1, "right-hand attack never drops left-hand movement");
    steer.fire("pointerup", 1, 190, 80);
    assert.deepEqual(controls.snapshot(), { horizontal: 0, depth: 0, jump: false, drop: false });

    pad.fire("pointerdown", 7, 600, 200, 80);
    assert.equal(controls.snapshot().jump, true, "central action button jumps on touchdown");
    assert.equal(controls.snapshot().jump, false, "central jump does not repeat while held");
    assert.equal(controls.consumeCombatGesture(), null, "central jump cannot fire a foot attack");
    pad.fire("pointerup", 7, 600, 200, 90);

    // No jump or drop button: free-zone gestures preserve both platform moves.
    steer.fire("pointerdown", 3, 110, 170, 100);
    steer.fire("pointerup", 3, 110, 170, 110);
    steer.fire("pointerdown", 4, 113, 175, 230);
    assert.equal(controls.snapshot().jump, true, "left double-tap jumps");
    assert.equal(controls.snapshot().jump, false, "jump is a single tick impulse");
    steer.fire("pointerdown", 5, 180, 185, 250);
    assert.equal(controls.snapshot().drop, true, "second left touch drops through platforms");
    steer.fire("pointerup", 4, 113, 175, 300);
    controls.dispose();
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
