#!/usr/bin/env bash
# Process the application email outbox (manual author campaigns) against the
# active release.
#
# Durable outbox, at-least-once processing, best-effort duplicate protection
# (flock + DB lease/claim). SMTP is not exactly-once: a rare duplicate is
# possible if the process dies after SMTP accepts the message but before
# sent_at is persisted.
#
# One run claims at most 25 rows. The lease is 120 seconds. This wrapper does
# not touch author sale, partner activation, or moderation outboxes.
#
# Does not restart PM2 / Nginx / Docker.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
LOCK_FILE="${LOCK_FILE:-/run/audiolad-application-email-outbox.lock}"
LOG_FILE="${LOG_FILE:-/var/log/audiolad/application-email-outbox.log}"
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
    "$NPM_BIN" run run:application-email-outbox 2>&1
)"
EXIT_CODE=$?
set -e

FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

RESULT_LINE="$(
  printf '%s\n' "$OUTPUT" | awk '/^\{.*"claimed".*"sent".*"failed".*\}$/ { line=$0 } END { print line }'
)"

CLAIMED="?"
SENT="?"
FAILED="?"
SUPPRESSED="?"
if [[ -n "$RESULT_LINE" ]]; then
  CLAIMED="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"claimed":\([0-9][0-9]*\).*/\1/p')"
  SENT="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"sent":\([0-9][0-9]*\).*/\1/p')"
  FAILED="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"failed":\([0-9][0-9]*\).*/\1/p')"
  SUPPRESSED="$(printf '%s' "$RESULT_LINE" | sed -n 's/.*"suppressed":\([0-9][0-9]*\).*/\1/p')"
  CLAIMED="${CLAIMED:-?}"
  SENT="${SENT:-?}"
  FAILED="${FAILED:-?}"
  SUPPRESSED="${SUPPRESSED:-?}"
fi

sanitize_output() {
  sed -E \
    -e 's/(AUDIOLAD_SMTP_[A-Z0-9_]*=).*/\1***/g' \
    -e 's/(AUDIOLAD_EMAIL_UNSUBSCRIBE_SECRET=).*/\1***/g' \
    -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g'
}

{
  log "start_at=$STARTED_AT finish_at=$FINISHED_AT claimed=$CLAIMED sent=$SENT failed=$FAILED suppressed=$SUPPRESSED exit=$EXIT_CODE release=$(basename "$CURRENT_RELEASE")"
  if [[ "$EXIT_CODE" -ne 0 ]]; then
    printf '%s\n' "$OUTPUT" | sanitize_output | tail -n 40
  fi
} | tee -a "$LOG_FILE"

exit "$EXIT_CODE"
