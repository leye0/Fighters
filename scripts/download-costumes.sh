#!/usr/bin/env bash
set -euo pipefail

# Quaternius CC0 Standard Peasant/Ranger outfits and hairstyles.
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
assets_dir="$(mktemp -d)"
trap 'rm -rf -- "$assets_dir"' EXIT
hair_dir="$assets_dir/hair"
mkdir -p "$hair_dir"
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

# The free Standard release also contains the female Ranger outfit (nine
# modular pieces), but the PixelTriks GLB endpoint sometimes responds 403.
# Download its glTF/BIN and original PNGs from this immutable, CC0 Standard
# pack import, pin every byte and bundle it into a texture-optimized GLB.
ranger_dir="$assets_dir/ranger"
mkdir -p "$ranger_dir"
ranger_commit='f8bf1d4dc7a4879e769255aa2168756a3268ebdd'
ranger_root="https://git.daniel-diekert.com/daniel/windgeschworen/raw/commit/$ranger_commit/assets/models/outfits"
for file in female_ranger.gltf female_ranger.bin; do
  curl -fLsS --retry 3 --max-time 65 "$ranger_root/komplett/$file" -o "$ranger_dir/$file"
done
for file in t_ranger_normal.png t_ranger_base_color.png t_ranger_orm.png \
  t_regular_female_normal.png t_regular_female_dark_base_color.png t_regular_female_roughness.png; do
  curl -fLsS --retry 3 --max-time 65 "$ranger_root/textures/$file" -o "$ranger_dir/$file"
done
(
  cd "$ranger_dir"
  sha256sum --check <<'RANGER_HASHES'
c642d38b31098dabcc3ebb25bddef16aab18720a5bd331242d7bcc25c0c4aa0e  female_ranger.gltf
d015964ba0a26eee9c9d2ea6f07aa660bba88aa536cf8bb6b67944b9e97c46df  female_ranger.bin
dd64da2af3180f0c8f0b721cfc5f0d2720c351b97da8285c6cf49e7717c84147  t_ranger_normal.png
846ef2170b04ee584ad83bb8a1e86dab57a9a43b1193204505912c274d949925  t_ranger_base_color.png
aca03d2fba12508ef07d5968ca22267fb207ea26ae898b6b2def8a296bd44f1c  t_ranger_orm.png
e1051d3d56df9cf061bc14c769c37253aecd595f8275f9d4c0d6e0e953c00e18  t_regular_female_normal.png
3b6ab973f9f3d6f8961226a0dbd99cf6d1b72df3795a8a5c1620a55754c161c2  t_regular_female_dark_base_color.png
da541fbd4b3bffe754fada5c29f8a0d8f836bf20ce7df8273607af4729a3a5ae  t_regular_female_roughness.png
RANGER_HASHES
)
node scripts/pack-female-ranger.mjs "$ranger_dir/female_ranger.gltf" "$ranger_dir" \
  app/models/quaternius_outfit_Female_Ranger.glb

sha256sum --check <<'ASSET_HASHES'
5abc4c3b64404fa636160ae4eddf30e746875e15de1101db14dacd5b5d5e7bba  app/models/quaternius_outfit_Female_Peasant.glb
bd0ee4210696d0b9a6af29945272fdb551da89f865eda7ce4070f6a38f046a8c  app/models/quaternius_outfit_Male_Peasant.glb
8ca4770e1a2095bd60c3ca59ad389f8331f24374564791e046219f9255fbb274  app/models/quaternius_ubc_Hair_Buns.glb
b5a99552117558224ef8ec681bd43cafd91862f209723a028872d464d3c669c4  app/models/quaternius_ubc_Hair_Buzzed.glb
c920a24949661e031957d2e2d347eb865efc61b784d72020635b53b32c472905  app/models/quaternius_ubc_Hair_SimpleParted.glb
ASSET_HASHES
node scripts/verify-costumes.mjs
