#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

BASE_URL="${1:-https://audiolad.ru}"
AUTH_MODE="${SMOKE_AUTH_MODE:-auto}"

if [[ "$BASE_URL" == "http://127.0.0.1:"* || "$BASE_URL" == "http://localhost:"* ]]; then
  AUTH_MODE="guest-only"
fi

log_info "Running HTTP smoke tests against $BASE_URL (no browser)"

export AUDIOLAD_SMOKE_BASE_URL="$BASE_URL"

# Prefer candidate/current release tree when present so cutover guards match
# the commit being deployed, not an unrelated dirty worktree.
SMOKE_ROOT="$GIT_WORKDIR"
if [[ -n "${CANDIDATE_RELEASE_DIR:-}" && -d "$CANDIDATE_RELEASE_DIR" ]]; then
  SMOKE_ROOT="$CANDIDATE_RELEASE_DIR"
elif [[ -n "${DEPLOY_ROOT:-}" && -d "$DEPLOY_ROOT/current" ]]; then
  # Public smoke after cutover: verify against the release that is now current.
  if [[ "$BASE_URL" == "https://audiolad.ru" || "$BASE_URL" == "http://audiolad.ru" ]]; then
    SMOKE_ROOT="$(readlink -f "$DEPLOY_ROOT/current")"
  fi
fi

cd "$SMOKE_ROOT"
node "$SMOKE_ROOT/scripts/production-smoke-http.mjs"

# Must-keep published SEO articles: fail deploy if any previously PUBLISHED
# URL is missing or returns non-200 on this base.
if [[ -f "$SMOKE_ROOT/scripts/seo-published-articles-regression.mjs" ]]; then
  log_info "Running published SEO articles regression against $BASE_URL"
  export AUDIOLAD_SEO_BASELINE_PATH="$SMOKE_ROOT/deploy/seo-published-article-urls.baseline.json"
  node "$SMOKE_ROOT/scripts/seo-published-articles-regression.mjs"
fi
