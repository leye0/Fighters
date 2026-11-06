#!/usr/bin/env bash
# Restore a QA-verified, versioned runtime asset bundle. No build dependencies.
# Run from the repository root. Normal QA/Pages runs never fetch source models.
set -euo pipefail

lock_file='assets/runtime-assets.lock'
tag="$(sed -n 's/^tag=//p' "$lock_file")"
archive="$(sed -n 's/^archive=//p' "$lock_file")"
expected_sha="$(sed -n 's/^sha256=//p' "$lock_file")"

if [[ ! "$tag" =~ ^fighters-runtime-assets-v[0-9]+$ ]] ||
   [[ "$archive" != "${tag}.zip" ]] ||
   [[ ! "$expected_sha" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Invalid or incomplete asset pin in ${lock_file}" >&2
  exit 1
fi

cache_dir='.cache/fighters'
mkdir -p "$cache_dir" docs
local_archive="${cache_dir}/${archive}"

if [[ -f "$local_archive" ]] && ! echo "${expected_sha}  ${local_archive}" | sha256sum --check --status; then
  echo 'Cached runtime archive has an invalid SHA-256; refreshing it.' >&2
  rm -f -- "$local_archive"
fi

if [[ ! -f "$local_archive" ]]; then
  download="$(mktemp "${cache_dir}/.runtime-download.XXXXXXXX")"
  trap 'rm -f -- "$download"' EXIT
  curl --fail --location --silent --show-error --retry 3 --retry-delay 2 \
    "https://github.com/leye0/Fighters/releases/download/${tag}/${archive}" -o "$download"
  echo "${expected_sha}  ${download}" | sha256sum --check
  mv -- "$download" "$local_archive"
fi

echo "${expected_sha}  ${local_archive}" | sha256sum --check
unzip -oq "$local_archive" -d docs
test -s docs/models/witch_house.glb
test -s docs/models/orc-buildings/manifest.json
test -s docs/models/human_male.rts.glb.gz
test -s docs/vendor/three/three.module.js
echo "Restored verified ${tag} into docs/"
