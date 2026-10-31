#!/usr/bin/env bash
# One command AFTER Adobe has returned all seven "With Skin" FBX downloads
# for ONE SAME character. Never uses/reexports the old YBot-baked assets.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: bash scripts/build-native-mixamo.sh <private-character-fbx-folder> <output.glb>" >&2
  exit 2
fi
folder="$1"
output="$2"
for binary in blender python3; do
  command -v "$binary" >/dev/null || { echo "Missing $binary" >&2; exit 2; }
done
test -d "$folder" || { echo "Missing private FBX folder: $folder" >&2; exit 2; }
for motion in Fighting_Idle Walking_21 Walking_6 Walking_Backwards Left_Turn_3 Jump Falling_Idle; do
  test -s "$folder/$motion.fbx" || {
    echo "Missing $folder/$motion.fbx (require ALL seven With Skin exports)" >&2
    exit 2
  }
done
test ! -e "$output" || { echo "Refusing to overwrite existing GLB: $output" >&2; exit 2; }
mkdir -p "$(dirname "$output")"
blender -b -t 2 --python-exit-code 1 --python scripts/assemble-native-mixamo.py -- "$folder" "$output"
python3 scripts/check-native-mixamo-glb.py "$output" --stamp
python3 scripts/inspect-runtime-glb.py "$output"
echo "Verified same-rig seven-motion GLB: $output"
echo "NEXT: inspect the GLB in native-mixamo-review.html at all five camera angles."
echo "DO NOT replace the public character GLB until human arm/wrist visual QA approves."
