#!/usr/bin/env bash
# Shared build for GitHub Pages and real-browser QA. Run from repository root.
# Models and their integrity checks must remain identical in both workflows.
set -euo pipefail

mkdir -p app/models
cp witch_house.glb app/models/witch_house.glb
cat orc_rts_building_set_-_proto_series.glb.part1 orc_rts_building_set_-_proto_series.glb.part2 > app/models/orc_rts_building_set_-_proto_series.glb
node -e "const fs=require('fs');const p='app/models/orc_rts_building_set_-_proto_series.glb';const b=fs.readFileSync(p);if(b.toString('ascii',0,4)!=='glTF'||b.readUInt32LE(8)!==b.length)process.exit(1);console.log('Orc GLB validated:',b.length,'bytes')"
# This build is occasional (new immutable asset version), not part of normal
# Pages/Chrome CI. npm ci installs the exact tree frozen in package-lock.json.
test -s package-lock.json || { echo 'Run the build-lock workflow first' >&2; exit 1; }
npm ci --no-audit --no-fund
mkdir -p app/vendor/three
cp node_modules/three/build/three.module.js app/vendor/three/three.module.js
cp node_modules/three/build/three.core.js app/vendor/three/three.core.js
cp -R node_modules/three/examples/jsm app/vendor/three/addons
node scripts/build-runtime-crops.mjs crops_low_poly.glb app/models/crops.rts.glb
node scripts/split-orc-buildings.mjs app/models/orc_rts_building_set_-_proto_series.glb app/models/orc-buildings
node scripts/test-orc-building-assets.mjs app/models/orc-buildings
python3 -m pip install --disable-pip-version-check shapely==2.1.2
node scripts/generate-building-footprints.mjs app/models/witch_house.glb app/models/orc-buildings
bash scripts/fetch-pinned-humans.sh
node scripts/verify-glb.mjs app/models/human_male.glb app/models/human_female.glb
bash scripts/compress-character-assets.sh app/models
node scripts/build-runtime-characters.mjs app/models
bash scripts/download-costumes.sh
bash scripts/download-sword.sh
node scripts/decompress-sword.mjs
