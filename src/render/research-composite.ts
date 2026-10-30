/** Source-backed, research-only YBot composites. None is approved for gameplay. */
export const RESEARCH_COMPOSITES = [
  { id: "idle", label: "Sur place + jab", source: "Fighting_Idle", travelMeters: 0, motion: "idle" },
  { id: "forward", label: "Avancer + jab", source: "Medium_Step_Forward", travelMeters: 0.9172, motion: "walk" },
  { id: "backward", label: "Reculer + jab", source: "Step_Backward_3", travelMeters: -0.5983, motion: "walk" },
  { id: "jump", label: "Sauter + jab", source: "Jump", travelMeters: 0, motion: "jump" },
] as const;

export type ResearchComposite = (typeof RESEARCH_COMPOSITES)[number];
export const RESEARCH_ATTACK = "Lead_Jab_2";

/** Only exact known basename.glb names are accepted; uploads never leave the browser. */
export function researchGlbStem(filename: string): string | null {
  if (!/^[a-z0-9_-]+\.glb$/i.test(filename)) return null;
  return filename.slice(0, -4);
}

export function assertMatchingResearchRig(baseBones: readonly string[], otherBones: readonly string[]): void {
  const normalize = (bones: readonly string[]) => [...bones].sort().join("\n");
  if (baseBones.length === 0 || normalize(baseBones) !== normalize(otherBones)) {
    throw new Error("Les clips n'ont pas exactement le même squelette. Pas de superposition sûre.");
  }
}

/** Illustrative world-space travel, separate from source hip motion and game physics. */
export function researchWorldOffset(
  composite: ResearchComposite,
  seconds: number,
  baseDuration: number,
): { x: number; y: number } {
  if (!Number.isFinite(seconds) || !Number.isFinite(baseDuration) || baseDuration <= 0) {
    throw new Error("Invalid composite timeline");
  }
  if (composite.motion === "jump") {
    const phase = Math.min(1, Math.max(0, seconds / baseDuration));
    return { x: 0, y: 0.45 * Math.sin(Math.PI * phase) };
  }
  const progress = Math.max(0, seconds / baseDuration);
  return { x: composite.travelMeters * progress, y: 0 };
}
