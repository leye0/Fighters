/**
 * Third-party files are never considered runtime-ready merely because their
 * listing says "free" or CC BY. The public game and the public source repo
 * have different distribution requirements.
 */
export interface AssetRecord {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly licenseClaim?: string;
  readonly licenseStatus?: string;
  readonly redistributionStatus?: string;
  readonly integrationStatus?: string;
  readonly likenessRightsStatus?: string;
  readonly runtimeUrl?: string;
  readonly attribution?: string | null;
  readonly visual?: {
    readonly modelForwardAxis?: "+Z" | "-Z" | "+X" | "-X";
    readonly metersPerUnit?: number;
    readonly animationMap?: Readonly<Record<string, string>>;
  };
}

export interface RuntimeFighterAsset extends AssetRecord {
  readonly kind: "character";
  readonly licenseStatus: "verified";
  readonly redistributionStatus: "approved_for_game";
  readonly integrationStatus: "integrated";
  readonly likenessRightsStatus: "verified" | "not_applicable";
  readonly runtimeUrl: string;
}

export function isRuntimeFighter(asset: AssetRecord): asset is RuntimeFighterAsset {
  if (asset.kind !== "character" ||
      asset.licenseStatus !== "verified" ||
      asset.redistributionStatus !== "approved_for_game" ||
      asset.integrationStatus !== "integrated" ||
      (asset.likenessRightsStatus !== "verified" &&
       asset.likenessRightsStatus !== "not_applicable") ||
      typeof asset.runtimeUrl !== "string" ||
      !asset.runtimeUrl.startsWith("/models/") ||
      !/\.glb(?:\?.*)?$/i.test(asset.runtimeUrl)) return false;

  // Attribution belongs in the game credits as well as in the repository.
  const license = asset.licenseClaim ?? "";
  if (/CC[\s-]*BY/i.test(license) && !asset.attribution?.trim()) return false;
  const scale = asset.visual?.metersPerUnit;
  return scale === undefined || (Number.isFinite(scale) && scale > 0);
}

export function runtimeRoster(assets: readonly AssetRecord[]): RuntimeFighterAsset[] {
  const ready = assets.filter(isRuntimeFighter);
  const unique = new Set<string>();
  return ready.filter(asset => {
    if (unique.has(asset.id)) return false;
    unique.add(asset.id);
    return true;
  });
}
