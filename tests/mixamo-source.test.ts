import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

type Clip = {
  id: string; filename: string; motionId: string; sourcePath: string;
  originalFrames: number; sourceFps: number; family: string; sourceDescription: string;
  sha256: string | null; binaryChecked?: boolean; runtimeStatus: string;
  licenseReview: string; animationReview: string;
  researchConversionStatus?: string;
  researchGlb?: { sha256: string; bytes: number; animations: number; channels: number; nodes: number; skins: number };
};
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('../assets/mixamo-available-clips.json', import.meta.url), 'utf8')) as {
  schemaVersion: number;
  source: { license: string; rawRedistributionInPublicRepoAllowed: boolean; folder: string };
  selection: { totalIndexedHere: number; convertedIntoRuntime: number; binaryFbxVerifiedInPrivateResearch: number; broaderNameOnlyCandidatesDiscarded: number; researchGlbConverted: number; researchGlbFailed: number; researchGlbTotalBytes: number; sourceFbxMissingForFullResearchSet: number };
  clips: Clip[];
};

test('catalog contains 471 indexed Mixamo motion candidates, with valid source metadata', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.clips.length, 471);
  assert.equal(catalog.selection.totalIndexedHere, catalog.clips.length);
  assert.equal(catalog.selection.broaderNameOnlyCandidatesDiscarded, 234);
  assert.equal(catalog.clips.some(c => c.filename === 'Walking_14.fbx'), true);
  assert.equal(catalog.clips.some(c => c.filename === 'Walking_20.fbx'), true);
  assert.equal(catalog.clips.some(c => c.filename === 'Walking_17.fbx'), false);
  assert.equal(new Set(catalog.clips.map(c => c.family)).size >= 10, true);
  assert.equal(new Set(catalog.clips.map(c => c.filename)).size, catalog.clips.length);
  assert.equal(new Set(catalog.clips.map(c => c.id)).size, catalog.clips.length);
  for (const clip of catalog.clips) {
    assert.match(clip.filename, /^[A-Za-z0-9_.-]+\.fbx$/);
    assert.equal(clip.sourcePath, catalog.source.folder + clip.filename);
    assert.match(clip.motionId, /^[a-f0-9-]{36}$/);
    assert.ok(clip.originalFrames > 0);
    assert.ok(clip.sourceDescription.trim().length > 0);
    assert.equal(clip.sourceFps, 30);
    assert.ok(clip.family.length > 0);
  }
});

test('research downloads are checked separately from playable animations', () => {
  assert.equal(catalog.source.license, 'adobe-mixamo-terms');
  assert.equal(catalog.source.rawRedistributionInPublicRepoAllowed, false);
  assert.equal(catalog.selection.convertedIntoRuntime, 0);
  const verified = catalog.clips.filter(c => c.binaryChecked);
  const converted = catalog.clips.filter(c => c.researchConversionStatus === 'validated_private_glb');
  assert.equal(catalog.selection.researchGlbConverted, converted.length);
  assert.equal(catalog.selection.researchGlbFailed, 0);
  assert.equal(catalog.selection.sourceFbxMissingForFullResearchSet, catalog.clips.length - verified.length);
  assert.equal(catalog.selection.binaryFbxVerifiedInPrivateResearch, verified.length);
  assert.equal(converted.length, verified.length, 'every acquired candidate must have a validated research GLB');
  assert.equal(catalog.selection.researchGlbTotalBytes, converted.reduce((bytes, c) => bytes + (c.researchGlb?.bytes ?? 0), 0));
  for (const clip of catalog.clips) {
    assert.equal(clip.runtimeStatus, 'not_integrated');
    assert.equal(clip.licenseReview, 'pending_for_integration');
    assert.equal(clip.animationReview, 'pending');
    if (clip.binaryChecked) assert.match(clip.sha256 ?? '', /^[a-f0-9]{64}$/);
    if (clip.researchConversionStatus === 'validated_private_glb') {
      assert.equal(clip.binaryChecked, true);
      assert.match(clip.researchGlb?.sha256 ?? '', /^[a-f0-9]{64}$/);
      assert.ok((clip.researchGlb?.channels ?? 0) > 0);
      assert.ok((clip.researchGlb?.animations ?? 0) > 0);
    }
  }
  const approved = JSON.parse(readFileSync(new URL('../assets/animation-inventory.json', import.meta.url), 'utf8')) as { clips: unknown[] };
  assert.equal(approved.clips.length, 0, 'metadata is not proof of playable combat');
});

test('no raw Mixamo FBX is stored in tracked asset folders', () => {
  const assetRoot = path.join(new URL('.', root).pathname, 'assets');
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else assert.equal(/\.fbx$/i.test(entry.name), false, `forbidden public FBX: ${target}`);
    }
  }
  walk(assetRoot);
});
