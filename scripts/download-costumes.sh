#!/usr/bin/env bash
set -euo pipefail

# Quaternius CC0 Standard Peasant outfits and hairstyles, served as individual GLBs.
# Pinned SHA-256 prevents a silent upstream replacement from changing our rig.
mkdir -p docs/models
# The upstream host sometimes blocks CI with HTTP 403. The previous, already
# SHA-pinned GitHub Pages deployment is our stable first-party mirror.
# Fall back to the CC0 source when the deployed copy is unavailable.
fetch_costume(){
  local category="$1" file="$2" dest="docs/models/$2"
  if ! curl -fLsS --retry 2 --max-time 50 "https://www.streamlev.com/Fighters/models/$file" -o "$dest"; then
    echo "Falling back to Quaternius CC0 source for $file" >&2
    curl -fLsS --retry 3 --max-time 50 "https://www.pixeltriks.com/characters/humans/$category/$file" -o "$dest"
  fi
}
fetch_costume outfits quaternius_outfit_Female_Peasant.glb
fetch_costume outfits quaternius_outfit_Male_Peasant.glb
fetch_costume hair quaternius_ubc_Hair_Buns.glb
fetch_costume hair quaternius_ubc_Hair_Buzzed.glb
fetch_costume hair quaternius_ubc_Hair_SimpleParted.glb

sha256sum --check <<'ASSET_HASHES'
5abc4c3b64404fa636160ae4eddf30e746875e15de1101db14dacd5b5d5e7bba  docs/models/quaternius_outfit_Female_Peasant.glb
bd0ee4210696d0b9a6af29945272fdb551da89f865eda7ce4070f6a38f046a8c  docs/models/quaternius_outfit_Male_Peasant.glb
8ca4770e1a2095bd60c3ca59ad389f8331f24374564791e046219f9255fbb274  docs/models/quaternius_ubc_Hair_Buns.glb
b5a99552117558224ef8ec681bd43cafd91862f209723a028872d464d3c669c4  docs/models/quaternius_ubc_Hair_Buzzed.glb
c920a24949661e031957d2e2d347eb865efc61b784d72020635b53b32c472905  docs/models/quaternius_ubc_Hair_SimpleParted.glb
ASSET_HASHES
node scripts/verify-costumes.mjs
