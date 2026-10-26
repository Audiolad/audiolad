#!/usr/bin/env bash
# Ensure audiolad-search-recrawl-worker is online on the active release.
# Online, stopped, and errored processes are deleted and started again from
# this release's ecosystem so cwd is the current symlink, not the previous
# release directory. Does not touch the audiolad web process, audiolad-p*
# apps, or other workers. No secrets.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ -n "${DEPLOY_TREE:-}" && -d "$DEPLOY_TREE" ]]; then
  DEPLOY_TREE="$(cd "$DEPLOY_TREE" && pwd -P)"
else
  DEPLOY_TREE="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi

APP_NAME="${SEARCH_RECRAWL_PM2_APP:-audiolad-search-recrawl-worker}"
ECOSYSTEM="${ECOSYSTEM:-$DEPLOY_TREE/search-recrawl-worker.ecosystem.config.cjs}"
PM2_BIN="${PM2_BIN:-pm2}"
SETTLE_SECONDS="${SEARCH_RECRAWL_WORKER_SETTLE_SECONDS:-3}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

pm2_status() {
  local raw status
  if ! command -v python3 >/dev/null 2>&1; then
    printf 'missing'
    return 0
  fi
  raw="$("$PM2_BIN" jlist 2>/dev/null || true)"
  status="$(
    APP_NAME="$APP_NAME" python3 -c '
import json, os, sys
name = os.environ["APP_NAME"]
raw = sys.stdin.read().strip()
if not raw:
    print("missing")
    raise SystemExit(0)
try:
    procs = json.loads(raw)
except Exception:
    print("missing")
    raise SystemExit(0)
if not isinstance(procs, list):
    print("missing")
    raise SystemExit(0)
for proc in procs:
    if not isinstance(proc, dict) or proc.get("name") != name:
        continue
    env = proc.get("pm2_env") if isinstance(proc.get("pm2_env"), dict) else {}
    print(env.get("status") or "unknown")
    raise SystemExit(0)
print("missing")
' <<<"$raw"
  )"
  printf '%s' "$status"
}

require_online() {
  local status
  status="$(pm2_status)"
  if [[ "$status" != "online" ]]; then
    log "search_recrawl_worker_not_online app=$APP_NAME status=$status"
    return 1
  fi
  return 0
}

start_from_release() {
  log "search_recrawl_worker_start app=$APP_NAME ecosystem=$ECOSYSTEM"
  if ! "$PM2_BIN" start "$ECOSYSTEM"; then
    log "search_recrawl_worker_start_failed app=$APP_NAME"
    return 1
  fi
}

if [[ ! -f "$ECOSYSTEM" ]]; then
  log "search_recrawl_worker_ecosystem_missing path=$ECOSYSTEM"
  exit 1
fi

STATUS="$(pm2_status)"
case "$STATUS" in
  missing)
    if ! start_from_release; then
      exit 1
    fi
    ;;
  *)
    log "search_recrawl_worker_cutover_restart app=$APP_NAME status=$STATUS"
    if ! "$PM2_BIN" delete "$APP_NAME"; then
      log "search_recrawl_worker_delete_failed app=$APP_NAME"
      exit 1
    fi
    if ! start_from_release; then
      exit 1
    fi
    ;;
esac

sleep "$SETTLE_SECONDS"
if ! require_online; then
  exit 1
fi
log "search_recrawl_worker_online app=$APP_NAME"
