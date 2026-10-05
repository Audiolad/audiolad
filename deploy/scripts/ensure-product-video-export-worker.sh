#!/usr/bin/env bash
# Ensure audiolad-product-video-export-worker is online for the active release.
# Missing ecosystem fails the caller. Existing stopped/errored processes are
# recovered; online processes are restarted at deploy cutover so they run the
# newly deployed code. Does not deploy/cut over web by itself and adds no secrets.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ -n "${DEPLOY_TREE:-}" && -d "$DEPLOY_TREE" ]]; then
  DEPLOY_TREE="$(cd "$DEPLOY_TREE" && pwd -P)"
else
  DEPLOY_TREE="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi

APP_NAME="${PRODUCT_VIDEO_EXPORT_PM2_APP:-audiolad-product-video-export-worker}"
ECOSYSTEM="${ECOSYSTEM:-$DEPLOY_TREE/product-video-export-worker.ecosystem.config.cjs}"
PM2_BIN="${PM2_BIN:-pm2}"
SETTLE_SECONDS="${PRODUCT_VIDEO_EXPORT_WORKER_SETTLE_SECONDS:-3}"

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
    log "product_video_export_worker_not_online app=$APP_NAME status=$status"
    return 1
  fi
  return 0
}

if [[ ! -f "$ECOSYSTEM" ]]; then
  log "product_video_export_worker_ecosystem_missing path=$ECOSYSTEM"
  exit 1
fi

STATUS="$(pm2_status)"
case "$STATUS" in
  online)
    log "product_video_export_worker_cutover_restart app=$APP_NAME"
    if ! "$PM2_BIN" restart "$APP_NAME" --update-env; then
      log "product_video_export_worker_restart_failed app=$APP_NAME"
      "$PM2_BIN" delete "$APP_NAME" || exit 1
      "$PM2_BIN" start "$ECOSYSTEM" || exit 1
    fi
    ;;
  missing)
    log "product_video_export_worker_start app=$APP_NAME"
    "$PM2_BIN" start "$ECOSYSTEM" || exit 1
    ;;
  stopped|errored|stopping|launching|waiting|one-launch-status)
    log "product_video_export_worker_recover app=$APP_NAME status=$STATUS"
    if ! "$PM2_BIN" restart "$APP_NAME" --update-env; then
      log "product_video_export_worker_restart_failed app=$APP_NAME"
      "$PM2_BIN" delete "$APP_NAME" || exit 1
      "$PM2_BIN" start "$ECOSYSTEM" || exit 1
    fi
    ;;
  *)
    log "product_video_export_worker_unexpected_status app=$APP_NAME status=$STATUS"
    "$PM2_BIN" restart "$APP_NAME" --update-env || exit 1
    ;;
esac

sleep "$SETTLE_SECONDS"
require_online || exit 1
log "product_video_export_worker_online app=$APP_NAME"
