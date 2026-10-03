#!/usr/bin/env bash
# Online preparation: fill a local npm cache from the lockfile while the
# registry is reachable. Refuses to run in offline mode. Not used by the
# readiness check and not run against production.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: seed-npm-cache.sh --git-dir DIR --sha SHA --cache DIR

Runs npm ci --ignore-scripts into a temp tree using only that cache.
Contacts the npm registry. Refuses when AUDIOLAD_EMERGENCY_OFFLINE=1.
EOF
  exit 0
fi

if [[ "${AUDIOLAD_EMERGENCY_OFFLINE:-}" == "1" ]]; then
  emergency_die "refusing to seed an npm cache while AUDIOLAD_EMERGENCY_OFFLINE=1"
fi

GIT_DIR=""
SHA=""
CACHE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --git-dir) GIT_DIR="${2:-}"; shift 2 ;;
    --sha) SHA="${2:-}"; shift 2 ;;
    --cache) CACHE="${2:-}"; shift 2 ;;
    *) emergency_die "unknown argument: $1" ;;
  esac
done
: "${GIT_DIR:?}"
: "${SHA:?}"
: "${CACHE:?}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || emergency_die "SHA must be 40 lowercase hex"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$CACHE"
git -C "$GIT_DIR" archive "$SHA" package.json package-lock.json | tar -x -C "$tmp"
(
  cd "$tmp"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  npm ci --ignore-scripts --cache "$CACHE"
)
emergency_log "npm_cache_seeded cache=${CACHE} sha=${SHA}"
