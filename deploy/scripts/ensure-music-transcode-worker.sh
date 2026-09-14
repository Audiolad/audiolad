#!/usr/bin/env bash
# Start the music transcode worker from the active release if it is not
# already running. Missing ecosystem file fails the caller. A start failure
# is warn-only so nginx cutover is not rolled back. Does not touch Studio
# worker, health-watch, or Nginx. No new secrets.
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

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

if [[ ! -f "$ECOSYSTEM" ]]; then
  log "music_transcode_worker_ecosystem_missing path=$ECOSYSTEM"
  exit 1
fi

if "$PM2_BIN" describe "$APP_NAME" >/dev/null 2>&1; then
  log "music_transcode_worker_already_running app=$APP_NAME"
  exit 0
fi

if ! "$PM2_BIN" start "$ECOSYSTEM"; then
  log "music_transcode_worker_start_failed app=$APP_NAME"
  exit 1
fi
log "music_transcode_worker_started app=$APP_NAME"
