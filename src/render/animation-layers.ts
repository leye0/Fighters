import { AnimationClip, type KeyframeTrack } from "three";

export type BodyLayer = "upperBody" | "lowerBody";

/** Normalize Mixamo, GLTF and FBX-style track bindings without assuming a specific character name. */
export function trackBoneName(trackName: string): string {
  const bracketed = trackName.match(/\.bones\[([^\]]+)\]/i)?.[1];
  const target = bracketed ?? trackName.split(".")[0];
  const leaf = target.split(/[|/:]/).at(-1) ?? "";
  return leaf.replace(/^mixamorig\d*/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isUpperBodyTrack(trackName: string): boolean {
  const bone = trackBoneName(trackName);
  return /^(spine\d*|chest|upperchest|neck\d*|head|jaw|eye.*|leftshoulder|rightshoulder|leftclavicle|rightclavicle|leftarm|rightarm|leftforearm|rightforearm|lefthand.*|righthand.*)$/.test(bone);
}

/**
 * Split clips into disjoint joints, so one mixer can play locomotion and an
 * attack simultaneously without two full-body actions fighting over the hips.
 * The artist must still approve each composite on the final character rig.
 */
export function maskClip(clip: AnimationClip, layer: BodyLayer): AnimationClip {
  const chosen: KeyframeTrack[] = clip.tracks
    .filter(track => {
      const upper = isUpperBodyTrack(track.name);
      if (layer === "upperBody") return upper;
      // Global position comes from the authoritative simulation, not Mixamo root motion.
      if (/^(hips|pelvis|root)$/.test(trackBoneName(track.name)) && /\.position$/.test(track.name)) return false;
      return !upper;
    })
    .map(track => track.clone());
  if (!chosen.length) throw new Error(`No ${layer} tracks in animation ${clip.name}`);
  return new AnimationClip(`${clip.name}__${layer}`, clip.duration, chosen);
}
