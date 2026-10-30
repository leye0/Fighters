import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

type Clip = {
  id: string; filename: string; motionId: string; sourcePath: string;
  originalFrames: number; sourceFps: number; family: string;
  sha256: string | null; binaryChecked?: boolean; runtimeStatus: string;
  licenseReview: string; animationReview: string;
};
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('../assets/mixamo-available-clips.json', import.meta.url), 'utf8')) as {
  schemaVersion: number;
  source: { license: string; rawRedistributionInPublicRepoAllowed: boolean; folder: string };
  selection: { totalIndexedHere: number; convertedIntoRuntime: number; binaryFbxVerifiedInPrivateResearch: number };
  clips: Clip[];
};

test('catalog contains 705 indexed Mixamo motion candidates, with valid source metadata', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.clips.length, 705);
  assert.equal(catalog.selection.totalIndexedHere, catalog.clips.length);
  assert.equal(new Set(catalog.clips.map(c => c.family)).size >= 10, true);
  assert.equal(new Set(catalog.clips.map(c => c.filename)).size, 103);
  assert.equal(new Set(catalog.clips.map(c => c.id)).size, 103);
  for (const clip of catalog.clips) {
    assert.match(clip.filename, /^[A-Za-z0-9_.-]+\.fbx$/);
    assert.equal(clip.sourcePath, catalog.source.folder + clip.filename);
    assert.match(clip.motionId, /^[a-f0-9-]{36}$/);
    assert.ok(clip.originalFrames > 0);
    assert.equal(clip.sourceFps, 30);
    assert.ok(clip.family.length > 0);
  }
});

test('research downloads are checked separately from playable animations', () => {
  assert.equal(catalog.source.license, 'adobe-mixamo-terms');
  assert.equal(catalog.source.rawRedistributionInPublicRepoAllowed, false);
  assert.equal(catalog.selection.convertedIntoRuntime, 0);
  assert.equal(catalog.clips.filter(c => c.binaryChecked).length, 7);
  assert.equal(catalog.selection.binaryFbxVerifiedInPrivateResearch, 7);
  for (const clip of catalog.clips) {
    assert.equal(clip.runtimeStatus, 'not_integrated');
    assert.equal(clip.licenseReview, 'pending_for_integration');
    assert.equal(clip.animationReview, 'pending');
    if (clip.binaryChecked) assert.match(clip.sha256 ?? '', /^[a-f0-9]{64}$/);
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
