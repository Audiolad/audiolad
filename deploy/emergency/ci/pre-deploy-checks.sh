#!/usr/bin/env bash
# Repository checks for one exact commit. Reads git objects only.
# Does not deploy and does not contact GitHub.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

usage() {
  cat <<'EOF'
Usage: pre-deploy-checks.sh <git-dir> <40-char-sha>

Extracts canonical deploy scripts from that commit and checks the markers
the emergency path relies on: npm ci/lint/build, HTTP smoke, readiness,
Playwright CDN skip, ancestry gate, and no deploy override.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 2 ]]; then
  emergency_die "usage: pre-deploy-checks.sh <git-dir> <sha>"
fi

GIT_DIR="$1"
SHA="$2"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || emergency_die "SHA must be 40 lowercase hex"
git -C "$GIT_DIR" cat-file -e "${SHA}^{commit}" || emergency_die "commit object missing"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

extract() {
  local path="$1"
  local dest="$2"
  git -C "$GIT_DIR" show "${SHA}:${path}" >"$dest"
}

extract deploy/scripts/deploy.sh "$tmp/deploy.sh"
extract deploy/scripts/run-from-target-sha.sh "$tmp/run-from-target-sha.sh"
extract deploy/scripts/github-actions-deploy-wrapper.sh "$tmp/wrapper.sh"
bash -n "$tmp/deploy.sh"
bash -n "$tmp/run-from-target-sha.sh"
bash -n "$tmp/wrapper.sh"

require_text() {
  local file="$1"
  local text="$2"
  if ! grep -q -F "$text" "$file"; then
    emergency_die "missing required text in $(basename "$file"): ${text}"
  fi
}

forbid_text() {
  local file="$1"
  local text="$2"
  if grep -v -E '^[[:space:]]*#' "$file" | grep -q -F "$text"; then
    emergency_die "forbidden text in $(basename "$file"): ${text}"
  fi
}

require_text "$tmp/deploy.sh" "npm ci"
require_text "$tmp/deploy.sh" "npm run lint"
require_text "$tmp/deploy.sh" "npm run build"
require_text "$tmp/deploy.sh" "smoke-test.sh"
require_text "$tmp/deploy.sh" "wait_for_production_readiness"
require_text "$tmp/deploy.sh" "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1"
require_text "$tmp/run-from-target-sha.sh" "git archive"
forbid_text "$tmp/run-from-target-sha.sh" "git reset --hard"
require_text "$tmp/wrapper.sh" "unset AUDIOLAD_DEPLOY_OVERRIDE"
require_text "$tmp/wrapper.sh" "merge-base --is-ancestor"
forbid_text "$tmp/wrapper.sh" "AUDIOLAD_DEPLOY_OVERRIDE=1"

printf 'pre_deploy_checks=ok\n'
printf 'sha=%s\n' "$SHA"
