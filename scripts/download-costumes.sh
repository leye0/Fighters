#!/usr/bin/env bash
set -euo pipefail

# Quaternius CC0 Standard Peasant outfits and hairstyles, served as individual GLBs.
# Pinned SHA-256 prevents a silent upstream replacement from changing our rig.
mkdir -p app/models
# The upstream host sometimes blocks CI with HTTP 403. The previous, already
# SHA-pinned GitHub Pages deployment is our stable first-party mirror.
# Fall back to the CC0 source when the deployed copy is unavailable.
fetch_costume(){
  local category="$1" file="$2" dest="app/models/$2"
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

# Hair_Long is another Quaternius Universal Base Characters CC0 mesh. Pin the
# glTF+BIN mirror to a Git commit and pack it into one GLB for offline gameplay.
hair_dir="$(mktemp -d)"
trap 'rm -f "$hair_dir/Hair_Long.gltf" "$hair_dir/Hair_Long.bin"; rmdir "$hair_dir"' EXIT
hair_source='https://raw.githubusercontent.com/fastrouter/experiments-costa-vista/23e87108a281ac827e2ea23691aa7bf4b544146e/public/assets/toon/hair'
curl -fLsS --retry 3 --max-time 50 "$hair_source/Hair_Long.gltf" -o "$hair_dir/Hair_Long.gltf"
curl -fLsS --retry 3 --max-time 50 "$hair_source/Hair_Long.bin" -o "$hair_dir/Hair_Long.bin"
(
  cd "$hair_dir"
  sha256sum --check <<'LONG_HAIR_HASHES'
4895e4fda7948cabdb4a6a2ef314b24bb366cd17439b15cef4d7d539607cb560  Hair_Long.gltf
268fd531d2c2ac321783d36fcf106d15c5c76e8923eec2c8704d5fe9de953589  Hair_Long.bin
LONG_HAIR_HASHES
)
node scripts/pack-hair-long.mjs "$hair_dir/Hair_Long.gltf" app/models/quaternius_ubc_Hair_Long.glb

sha256sum --check <<'ASSET_HASHES'
5abc4c3b64404fa636160ae4eddf30e746875e15de1101db14dacd5b5d5e7bba  app/models/quaternius_outfit_Female_Peasant.glb
bd0ee4210696d0b9a6af29945272fdb551da89f865eda7ce4070f6a38f046a8c  app/models/quaternius_outfit_Male_Peasant.glb
8ca4770e1a2095bd60c3ca59ad389f8331f24374564791e046219f9255fbb274  app/models/quaternius_ubc_Hair_Buns.glb
b5a99552117558224ef8ec681bd43cafd91862f209723a028872d464d3c669c4  app/models/quaternius_ubc_Hair_Buzzed.glb
c920a24949661e031957d2e2d347eb865efc61b784d72020635b53b32c472905  app/models/quaternius_ubc_Hair_SimpleParted.glb
ASSET_HASHES
node scripts/verify-costumes.mjs
