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

log_info "Running smoke tests against $BASE_URL (auth mode: $AUTH_MODE)"

export AUDIOLAD_SMOKE_BASE_URL="$BASE_URL"
export AUDIOLAD_SMOKE_AUTH_MODE="$AUTH_MODE"
export AUDIOLAD_SMOKE_SCREENSHOT_DIR="$DEPLOY_LOG_DIR/smoke-screenshots"

node "$SCRIPT_DIR/production-smoke.mjs"
exit $?
