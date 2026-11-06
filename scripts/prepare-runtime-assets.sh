#!/usr/bin/env bash
# Shared build for GitHub Pages and real-browser QA. Run from repository root.
# Models and their integrity checks must remain identical in both workflows.
set -euo pipefail

mkdir -p docs/models
cp witch_house.glb docs/models/witch_house.glb
cat orc_rts_building_set_-_proto_series.glb.part1 orc_rts_building_set_-_proto_series.glb.part2 > docs/models/orc_rts_building_set_-_proto_series.glb
node -e "const fs=require('fs');const p='docs/models/orc_rts_building_set_-_proto_series.glb';const b=fs.readFileSync(p);if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(8)!==b.length)process.exit(1);console.log('Orc GLB validated:',b.length,'bytes')"
npm install --no-save --no-package-lock --no-audit --no-fund @gltf-transform/core@4.2.1 @gltf-transform/functions@4.2.1 three@0.180.0 @gltf-transform/extensions@4.2.1 sharp@0.34.4
mkdir -p docs/vendor/three
cp node_modules/three/build/three.module.js docs/vendor/three/three.module.js
cp node_modules/three/build/three.core.js docs/vendor/three/three.core.js
cp -R node_modules/three/examples/jsm docs/vendor/three/addons
node scripts/build-runtime-crops.mjs crops_low_poly.glb docs/models/crops.rts.glb
node scripts/split-orc-buildings.mjs docs/models/orc_rts_building_set_-_proto_series.glb docs/models/orc-buildings
node scripts/test-orc-building-assets.mjs docs/models/orc-buildings
python3 -m pip install --disable-pip-version-check shapely==2.1.2
node scripts/generate-building-footprints.mjs docs/models/witch_house.glb docs/models/orc-buildings
bash scripts/fetch-pinned-humans.sh
node scripts/verify-glb.mjs docs/models/human_male.glb docs/models/human_female.glb
bash scripts/compress-character-assets.sh docs/models
node scripts/build-runtime-characters.mjs docs/models
bash scripts/download-costumes.sh
bash scripts/download-sword.sh
npm install --no-save --no-package-lock --no-audit --no-fund meshoptimizer@0.25.0
node scripts/decompress-sword.mjs
