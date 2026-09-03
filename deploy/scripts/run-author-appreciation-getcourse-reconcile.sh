#!/usr/bin/env bash
# Recover pending GetCourse appreciation intents against the active release.
#
# ONE Export API export per run, then in-memory exact deal-id correlation.
# No-op when there are no pending intents. Does not restart PM2 / Nginx / Docker.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
LOCK_FILE="${LOCK_FILE:-/run/audiolad-author-appreciation-getcourse-reconcile.lock}"
LOG_FILE="${LOG_FILE:-/var/log/audiolad/author-appreciation-getcourse-reconcile.log}"
ENV_FILE="${ENV_FILE:-$DEPLOY_ROOT/shared/.env.production}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-90}"
NPM_BIN="${NPM_BIN:-npm}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

require_absolute() {
  local label="$1"
  local path="$2"
  if [[ -z "$path" || "$path" != /* ]]; then
    log "ERROR ${label} must be an absolute path, got: ${path:-<empty>}"
    exit 1
  fi
}

require_absolute DEPLOY_ROOT "$DEPLOY_ROOT"
require_absolute LOCK_FILE "$LOCK_FILE"
require_absolute LOG_FILE "$LOG_FILE"
require_absolute ENV_FILE "$ENV_FILE"

mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$LOCK_FILE")"

exec 9>>"$LOCK_FILE"
if ! flock -n 9; then
  log "skip locked=1 reason=another_worker_holds_flock"
  exit 0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR missing env file: $ENV_FILE"
  exit 1
fi

CURRENT_LINK="$DEPLOY_ROOT/current"
if [[ ! -L "$CURRENT_LINK" ]]; then
  log "ERROR missing current release symlink: $CURRENT_LINK"
  exit 1
fi

CURRENT_RELEASE="$(readlink -f "$CURRENT_LINK")"
if [[ -z "$CURRENT_RELEASE" || ! -d "$CURRENT_RELEASE" ]]; then
  log "ERROR cannot resolve current release from $CURRENT_LINK"
  exit 1
fi

if [[ ! -f "$CURRENT_RELEASE/package.json" ]]; then
  log "ERROR current release looks incomplete: $CURRENT_RELEASE"
  exit 1
fi

STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "start release=$CURRENT_RELEASE timeout_seconds=$TIMEOUT_SECONDS"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$CURRENT_RELEASE"

OUTPUT=""
EXIT_CODE=0
set +e
OUTPUT="$(
  timeout --signal=TERM --kill-after=15s "$TIMEOUT_SECONDS" \
    "$NPM_BIN" run run:author-appreciation-getcourse-reconcile 2>&1
)"
EXIT_CODE=$?
set -e

FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

RESULT_LINE="$(
  printf '%s\n' "$OUTPUT" | awk '/^\{.*"attempted".*"applied".*"exports".*\}$/ { line=$0 } END { print line }'
)"

ATTEMPTED="?"
APPLIED="?"
EXPORTS="?"
DEFERRED="?"
if [[ -n "$RESULT_LINE" ]]; then
  ATTEMPTED="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"attempted":\([0-9][0-9]*\).*/\1/p')"
  APPLIED="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"applied":\([0-9][0-9]*\).*/\1/p')"
  EXPORTS="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"exports":\([0-9][0-9]*\).*/\1/p')"
  DEFERRED="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"deferred":\(true\|false\).*/\1/p')"
  ATTEMPTED="${ATTEMPTED:-?}"
  APPLIED="${APPLIED:-?}"
  EXPORTS="${EXPORTS:-?}"
  DEFERRED="${DEFERRED:-?}"
fi

{
  log "start_at=$STARTED_AT finish_at=$FINISHED_AT attempted=$ATTEMPTED applied=$APPLIED exports=$EXPORTS deferred=$DEFERRED exit=$EXIT_CODE release=$(basename "$CURRENT_RELEASE")"
  if [[ "$EXIT_CODE" -ne 0 ]]; then
    printf '%s\n' "$OUTPUT" \
      | sed -E \
        -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
        -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
        -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
        -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g' \
      | tail -n 40
  fi
} | tee -a "$LOG_FILE"

exit "$EXIT_CODE"
