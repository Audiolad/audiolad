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

redact_stream() {
  sed -E \
    -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
    -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
    -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g'
}

require_absolute() {
  local label="$1"
  local path="$2"
  if [[ -z "$path" || "$path" != /* ]]; then
    log "ERROR ${label} must be an absolute path, got: ${path:-<empty>}"
    exit 1
  fi
}

extract_reconcile_json() {
  printf '%s\n' "$1" | node -e '
const fs = require("fs");
const lines = fs.readFileSync(0, "utf8").split(/\n/);
let result = null;
for (const raw of lines) {
  const line = raw.trim();
  if (!line.startsWith("{")) continue;
  try {
    const value = JSON.parse(line);
    if (
      value &&
      typeof value.attempted === "number" &&
      typeof value.applied === "number" &&
      typeof value.exports === "number"
    ) {
      result = value;
    }
  } catch {
    // ignore non-json lines such as npm lifecycle prefixes
  }
}
if (result) process.stdout.write(JSON.stringify(result));
'
}

json_field() {
  local json="$1"
  local field="$2"
  local default="${3:-?}"
  printf '%s' "$json" | node -e '
const fs = require("fs");
const field = process.argv[1];
const fallback = process.argv[2];
const raw = fs.readFileSync(0, "utf8").trim();
if (!raw) {
  process.stdout.write(fallback);
  process.exit(0);
}
try {
  const value = JSON.parse(raw)[field];
  if (typeof value === "number" || typeof value === "boolean") {
    process.stdout.write(String(value));
  } else {
    process.stdout.write(fallback);
  }
} catch {
  process.stdout.write(fallback);
}
' "$field" "$default"
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
  log "APPRECIATION_RECONCILE attempted=0 correlatable=0 applied=0 exports=0 deferred=false provider_error=false exit=0 reason=locked"
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

RESULT_JSON="$(extract_reconcile_json "$OUTPUT")"
ATTEMPTED="$(json_field "$RESULT_JSON" attempted "?")"
CORRELATABLE="$(json_field "$RESULT_JSON" correlatable "?")"
APPLIED="$(json_field "$RESULT_JSON" applied "?")"
EXPORTS="$(json_field "$RESULT_JSON" exports "?")"
DEFERRED="$(json_field "$RESULT_JSON" deferred "?")"
PROVIDER_ERROR="$(json_field "$RESULT_JSON" provider_error "?")"
SKIP_REASONS="$(
  if [[ -n "$RESULT_JSON" ]]; then
    printf '%s' "$RESULT_JSON" | node -e '
const fs = require("fs");
const raw = fs.readFileSync(0, "utf8").trim();
if (!raw) process.exit(0);
try {
  const value = JSON.parse(raw).skip_reasons_summary;
  if (typeof value === "string" && value.trim()) process.stdout.write(value.trim());
} catch {}
'
  fi
)"
SKIP_REASONS="${SKIP_REASONS:-none}"

SHOULD_DUMP_OUTPUT=0
if [[ "$EXIT_CODE" -ne 0 ]]; then
  SHOULD_DUMP_OUTPUT=1
elif [[ -n "$RESULT_JSON" && "$APPLIED" == "0" && "$ATTEMPTED" != "0" && "$ATTEMPTED" != "?" ]]; then
  SHOULD_DUMP_OUTPUT=1
fi

{
  log "start_at=$STARTED_AT finish_at=$FINISHED_AT attempted=$ATTEMPTED correlatable=$CORRELATABLE applied=$APPLIED exports=$EXPORTS deferred=$DEFERRED provider_error=$PROVIDER_ERROR exit=$EXIT_CODE release=$(basename "$CURRENT_RELEASE")"
  log "APPRECIATION_RECONCILE attempted=$ATTEMPTED correlatable=$CORRELATABLE applied=$APPLIED exports=$EXPORTS deferred=$DEFERRED provider_error=$PROVIDER_ERROR exit=$EXIT_CODE skip_reasons=${SKIP_REASONS:-none}"
  if [[ "$SHOULD_DUMP_OUTPUT" -eq 1 ]]; then
    printf '%s\n' "$OUTPUT" | redact_stream | tail -n 60
  fi
} | tee -a "$LOG_FILE"

exit "$EXIT_CODE"
