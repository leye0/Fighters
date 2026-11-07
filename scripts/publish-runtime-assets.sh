#!/usr/bin/env bash
# Run only after the normal Chrome QA matrix succeeded against this artifact.
# Assets come from actions/download-artifact, NOT a second, untested rebuild.
set -euo pipefail

version="${FIGHTERS_ASSET_VERSION:?Expected the next version from the assets job}"
if [[ ! "$version" =~ ^v[0-9]+$ ]]; then
  echo 'Invalid runtime asset version' >&2
  exit 1
fi
tag="fighters-runtime-assets-${version}"
archive="${tag}.zip"
test -s app/models/witch_house.glb
test -s app/models/orc-buildings/manifest.json
test -s app/models/human_male.rts.glb.gz
test -s app/vendor/three/three.module.js

current_tag="$(sed -n 's/^tag=//p' assets/runtime-assets.lock)"
if [[ "$current_tag" =~ ^fighters-runtime-assets-v([0-9]+)$ ]] &&
   [[ "$version" != "v$(( ${BASH_REMATCH[1]} + 1 ))" ]]; then
  echo "Expected the version after ${current_tag}, got ${version}" >&2
  exit 1
fi

# Before creating an immutable-by-policy Release, reject a concurrent update
# or an already used version. Never force-push and never overwrite an archive.
git fetch origin main
if [[ "$(git rev-parse origin/main)" != "$GITHUB_SHA" ]]; then
  echo 'Main advanced while assets were tested; retry on current main.' >&2
  exit 1
fi
if gh release view "$tag" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  echo "${tag} already exists. Never overwrite verified versions." >&2
  exit 1
fi

(cd app && zip -q -r "../${archive}" models vendor)
unzip -tq "$archive"
sha="$(sha256sum "$archive" | cut -d' ' -f1)"
gh release create "$tag" "$archive" \
  --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" \
  --title "Fighters runtime assets ${version}" \
  --notes "Built by the regular Chrome QA from ${GITHUB_SHA}; visual, economy and combat passed. SHA-256: ${sha}." \
  --latest=false

FIGHTERS_ASSET_TAG="$tag" FIGHTERS_ASSET_ARCHIVE="$archive" FIGHTERS_ASSET_SHA="$sha" node -e '
  const fs=require("node:fs");
  const {FIGHTERS_ASSET_TAG:tag,FIGHTERS_ASSET_ARCHIVE:archive,FIGHTERS_ASSET_SHA:sha}=process.env;
  fs.writeFileSync("assets/runtime-assets.lock",`# Assets prebuilt by scripts/prepare-runtime-assets.sh and verified in Chrome.\n# Change only after publishing and validating a new immutable GitHub Release.\ntag=${tag}\narchive=${archive}\nsha256=${sha}\n`);
'
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add assets/runtime-assets.lock
git commit -m "Pin verified Fighters runtime assets ${version}"
bash scripts/publish-generated-result.sh browser-qa-runtime-assets

# GITHUB_TOKEN pushes intentionally do not trigger ordinary push workflows.
# Dispatch the SAME browser QA and Pages workflows, now using this locked ZIP.
gh workflow run browser-qa.yml --repo "$GITHUB_REPOSITORY" --ref main
gh workflow run pages.yml --repo "$GITHUB_REPOSITORY" --ref main
echo "Published ${tag} with SHA-256 ${sha}; pinned QA and Pages dispatched."
