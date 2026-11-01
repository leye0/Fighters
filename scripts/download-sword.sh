#!/usr/bin/env bash
set -euo pipefail
# Public CC0 sword release, with authored identity 'grip' and hand socket recipe.
# Source: https://github.com/moritzbrantner/asset-tooling/tree/main/docs
base="https://github.com/moritzbrantner/asset-tooling/releases/download/humanoid-ranger-female"
mkdir -p docs/models
for ext in gltf bin; do
  curl -fLsS --retry 3 --max-time 90 "$base/equipment.sword.arming.default.$ext" -o "docs/models/equipment.sword.arming.default.$ext"
done
sha256sum --check <<'ASSET_HASHES'
43f6af8d45303825b804f7260c796d592b411e10c19f438b7ed43bce6c67d6b6  docs/models/equipment.sword.arming.default.gltf
e27300be909b52849c7987bcb5cf581437c72111adfd3cc174e5af8e732dba49  docs/models/equipment.sword.arming.default.bin
ASSET_HASHES
node --input-type=module <<'CHECK'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const gltf=JSON.parse(readFileSync('docs/models/equipment.sword.arming.default.gltf','utf8'));
const grip=gltf.nodes?.find(n=>n.name==='grip');
assert(grip,'Sword must have authored grip origin');
assert(!grip.translation||grip.translation.every(v=>Math.abs(v)<1e-5),'Grip translation must be identity');
assert(!grip.rotation||grip.rotation.every((v,i)=>Math.abs(v-(i===3?1:0))<1e-5),'Grip rotation must be identity');
assert(gltf.meshes?.length>0,'Sword mesh must exist');
assert(gltf.buffers?.some(b=>b.uri==='equipment.sword.arming.default.bin'),'Sword must have pinned binary buffer');
console.log('CC0 sword mesh + grip + SHA-256 verified');
CHECK
