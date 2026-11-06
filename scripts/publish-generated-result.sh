#!/usr/bin/env bash
# Persist a verified generator commit before attempting a non-PR integration.
# Usage: bash scripts/publish-generated-result.sh workflow-slug [target-branch]
# The original output stays recoverable under automation-results/ if main moved
# or the cherry-pick conflicts. Never use force-push or silently resolve conflicts.
set -euo pipefail

workflow_slug="${1:?Expected a workflow slug}"
target_branch="${2:-main}"
if [[ ! "$workflow_slug" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] ||
   [[ ! "$target_branch" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]*$ ]]; then
  echo 'Invalid workflow slug or target branch' >&2
  exit 2
fi

run_id="${GITHUB_RUN_ID:?GITHUB_RUN_ID must identify a real workflow run}"
attempt="${GITHUB_RUN_ATTEMPT:-1}"
if [[ ! "$run_id" =~ ^[0-9]+$ ]] || [[ ! "$attempt" =~ ^[0-9]+$ ]]; then
  echo 'Invalid GitHub run ID or attempt' >&2
  exit 2
fi

generated_sha="$(git rev-parse --verify HEAD^{commit})"
result_branch="automation-results/${workflow_slug}/${run_id}-${attempt}"
git push origin "${generated_sha}:refs/heads/${result_branch}"
echo "Saved generator commit ${generated_sha} as ${result_branch}"

# A failed integration MUST NOT lose the generated audio or asset lock: the
# result branch already exists and can be replayed after resolving conflicts.
for try in 1 2 3 4 5; do
  git fetch --quiet origin "${target_branch}"
  base_sha="$(git rev-parse --verify FETCH_HEAD^{commit})"
  if git merge-base --is-ancestor "$generated_sha" "$base_sha"; then
    echo "Already integrated on ${target_branch}: ${generated_sha}"
    exit 0
  fi
  git switch --quiet --detach "$base_sha"
  if ! git cherry-pick --no-edit "$generated_sha"; then
    git cherry-pick --abort || true
    echo "Integration conflict; recover output from ${result_branch}" >&2
    exit 1
  fi
  if git push origin "HEAD:refs/heads/${target_branch}"; then
    echo "Integrated ${result_branch} into ${target_branch} (try ${try})"
    exit 0
  fi
  echo "${target_branch} moved during push; retrying from its current HEAD" >&2
done

echo "Concurrent updates prevented integration; output remains in ${result_branch}" >&2
exit 1
