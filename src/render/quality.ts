export type QualityPreset = "ultra" | "high" | "medium" | "low";

export interface RenderQuality {
  readonly devicePixelRatioCap: number;
  readonly shadowMapSize: 4096 | 2048 | 1024 | 512;
  readonly maxAnisotropy: number;
}

const PROFILES: Readonly<Record<QualityPreset, RenderQuality>> = {
  ultra: { devicePixelRatioCap: 2, shadowMapSize: 4096, maxAnisotropy: 16 },
  high: { devicePixelRatioCap: 1.75, shadowMapSize: 2048, maxAnisotropy: 8 },
  medium: { devicePixelRatioCap: 1.5, shadowMapSize: 1024, maxAnisotropy: 4 },
  low: { devicePixelRatioCap: 1, shadowMapSize: 512, maxAnisotropy: 2 },
};

export function qualityProfile(preset: QualityPreset): RenderQuality {
  return PROFILES[preset];
}

export function renderPixelRatio(preset: QualityPreset, physicalDpr: number): number {
  const safe = Number.isFinite(physicalDpr) && physicalDpr > 0 ? physicalDpr : 1;
  return Math.max(0.5, Math.min(safe, PROFILES[preset].devicePixelRatioCap));
}
