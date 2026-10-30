/** Deterministically extract only the 63 source identities needed by the mobile review. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalog = JSON.parse(readFileSync(resolve(root, "assets/mixamo-available-clips.json"), "utf8")) as {
  clips: Array<{
    filename: string; motionId: string; sourceDescription: string;
    originalFrames: number; sourceFps: number; sha256: string | null;
    researchGlb?: { sha256: string };
  }>;
};
const shortlist = JSON.parse(readFileSync(resolve(root, "assets/mixamo-shortlist.json"), "utf8")) as {
  groups: Array<{ filenames: string[] }>;
};
const sources = new Map(catalog.clips.map(clip => [clip.filename, clip]));
const names = shortlist.groups.flatMap(group => group.filenames);
if (names.length !== 63 || new Set(names).size !== names.length) {
  throw new Error("Expected 63 distinct shortlisted Mixamo clips");
}
const clips = names.map(filename => {
  const clip = sources.get(filename);
  if (!clip || !clip.motionId || !clip.sha256) throw new Error(`Missing source identity: ${filename}`);
  const { motionId, sourceDescription, originalFrames, sourceFps, sha256, researchGlb } = clip;
  return { filename, motionId, sourceDescription, originalFrames, sourceFps, sha256, ...(researchGlb ? { researchGlb } : {}) };
});
writeFileSync(resolve(root, "assets/mixamo-review-sources.json"), JSON.stringify({ schemaVersion: 1, clips }, null, 2) + "\n");
