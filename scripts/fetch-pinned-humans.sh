#!/usr/bin/env bash
set -euo pipefail

# The upstream raw GitHub endpoint can time out on hosted runners. Our own
# published Pages copy contains the same unmodified original GLB; the caller
# verifies its pinned Git blob SHA before any conversion or deployment.
mkdir -p docs/models
for gender in male female; do
  file="human_${gender}.glb"
  mirror="https://www.streamlev.com/Fighters/models/${file}"
  upstream="https://raw.githubusercontent.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/5821923af517ac5fdc82505faa92a0d575fc1b1a/test/${file}"
  if ! curl -fLsS --connect-timeout 8 --max-time 40 --retry 1 --retry-delay 2 \
    "$mirror" -o "docs/models/${file}"; then
    echo "Pinned first-party mirror unavailable; trying original source: ${file}" >&2
    curl -fLsS --connect-timeout 12 --max-time 60 --retry 2 --retry-delay 2 \
      "$upstream" -o "docs/models/${file}"
  fi
done
