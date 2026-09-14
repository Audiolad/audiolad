#!/usr/bin/env bash
# Ensure audiolad-music-transcode-worker is online for the active release.
# Missing ecosystem fails the caller. Existing stopped/errored processes are
# recovered; absent processes are started. Online processes are left alone
# for self-refresh. Does not touch Studio worker, health-watch, or Nginx.
# No new secrets.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ -n "${DEPLOY_TREE:-}" && -d "$DEPLOY_TREE" ]]; then
  DEPLOY_TREE="$(cd "$DEPLOY_TREE" && pwd -P)"
else
  DEPLOY_TREE="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi

APP_NAME="${MUSIC_TRANSCODE_PM2_APP:-audiolad-music-transcode-worker}"
ECOSYSTEM="${ECOSYSTEM:-$DEPLOY_TREE/music-transcode-worker.ecosystem.config.cjs}"
PM2_BIN="${PM2_BIN:-pm2}"
SETTLE_SECONDS="${MUSIC_TRANSCODE_WORKER_SETTLE_SECONDS:-3}"

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
    log "music_transcode_worker_not_online app=$APP_NAME status=$status"
    return 1
  fi
  return 0
}

if [[ ! -f "$ECOSYSTEM" ]]; then
  log "music_transcode_worker_ecosystem_missing path=$ECOSYSTEM"
  exit 1
fi

STATUS="$(pm2_status)"
case "$STATUS" in
  online)
    log "music_transcode_worker_already_online app=$APP_NAME"
    exit 0
    ;;
  missing)
    log "music_transcode_worker_start app=$APP_NAME"
    if ! "$PM2_BIN" start "$ECOSYSTEM"; then
      log "music_transcode_worker_start_failed app=$APP_NAME"
      exit 1
    fi
    ;;
  stopped|errored|stopping|launching|waiting|one-launch-status)
    log "music_transcode_worker_recover app=$APP_NAME status=$STATUS"
    if ! "$PM2_BIN" restart "$APP_NAME" --update-env; then
      log "music_transcode_worker_restart_failed app=$APP_NAME"
      if ! "$PM2_BIN" delete "$APP_NAME"; then
        log "music_transcode_worker_delete_failed app=$APP_NAME"
        exit 1
      fi
      if ! "$PM2_BIN" start "$ECOSYSTEM"; then
        log "music_transcode_worker_start_failed app=$APP_NAME"
        exit 1
      fi
    fi
    ;;
  *)
    log "music_transcode_worker_unexpected_status app=$APP_NAME status=$STATUS"
    if ! "$PM2_BIN" restart "$APP_NAME" --update-env; then
      log "music_transcode_worker_restart_failed app=$APP_NAME"
      exit 1
    fi
    ;;
esac

sleep "$SETTLE_SECONDS"
if ! require_online; then
  exit 1
fi
log "music_transcode_worker_online app=$APP_NAME"
