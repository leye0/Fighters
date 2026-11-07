#!/usr/bin/env bash
# Lossless HTTP payload for the two pinned Quaternius GLBs.
# Unlike animation resampling or rig retargeting, gzip preserves every byte,
# native joint index, keyframe, and all 86 authored clips.
set -euo pipefail
dir="${1:-app/models}"
for name in human_female human_male; do
  input="$dir/$name.glb"
  output="$input.gz"
  test -s "$input"
  gzip -n -9 -c "$input" > "$output"
  gzip -t "$output"
  original_hash="$(sha256sum "$input" | cut -d' ' -f1)"
  compressed_hash="$(gzip -cd "$output" | sha256sum | cut -d' ' -f1)"
  if [[ "$original_hash" != "$compressed_hash" ]]; then
    echo "Lossless character verification FAILED: $name" >&2
    exit 1
  fi
  original_size="$(stat -c %s "$input")"
  compressed_size="$(stat -c %s "$output")"
  echo "CHARACTER_GZIP name=$name raw_bytes=$original_size gzip_bytes=$compressed_size ratio_pct=$((100*compressed_size/original_size)) integrity=PASS"
done
