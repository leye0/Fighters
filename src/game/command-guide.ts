import { MOTIONS, type DirectionCode } from "../engine/commands.ts";
import type { MoveDefinition } from "../engine/simulation.ts";

const ARROWS: Readonly<Record<DirectionCode, string>> = {
  1:"↙", 2:"↓", 3:"↘", 4:"←", 5:"•", 6:"→", 7:"↖", 8:"↑", 9:"↗",
};

export function moveCategory(move: MoveDefinition): string {
  if (move.motion === "full-circle" || move.motion?.startsWith("double-")) return "Super";
  if (move.motion) return "Spécial";
  if (move.buttons && move.buttons.length > 1) return "Touches combinées";
  if (move.stance === "airborne") return "Aérien";
  if (move.stance === "crouching") return "Accroupi";
  if (move.direction) return "Directionnel";
  return "Normal";
}

/** Relative notation: right = forward when the fighter faces right. */
export function moveCommand(move: MoveDefinition): string {
  const motion = move.motion ? MOTIONS[move.motion].map(dir => ARROWS[dir]).join(" ") : "";
  const posture = move.stance === "airborne" ? "AIR" :
    move.stance === "crouching" ? "↓" : "";
  const direction = move.direction === "forward" ? "→" :
    move.direction === "back" ? "←" : "";
  const controls = move.buttons?.join(" + ") ?? move.button;
  return [motion || [posture, direction].filter(Boolean).join(" + "), controls]
    .filter(Boolean).join(" + ");
}
