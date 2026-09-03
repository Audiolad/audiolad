#!/usr/bin/env bash
# Install/enable the appreciation GetCourse reconcile timer from the active
# release deploy tree. Mandatory payment-recovery component: missing units
# or enable failure must fail the caller deploy (not warn-and-continue).
# Does not restart PM2 / Nginx / Docker. No new secrets.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# Prefer the full release tree (git archive of the commit includes
# deploy/systemd). The pinned deploy-scripts snapshot historically
# extracted only deploy/scripts and therefore missed the unit files.
if [[ -n "${DEPLOY_TREE:-}" && -d "$DEPLOY_TREE" ]]; then
  DEPLOY_TREE="$(cd "$DEPLOY_TREE" && pwd -P)"
else
  DEPLOY_TREE="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi

WRAPPER_SRC="$SCRIPT_DIR/run-author-appreciation-getcourse-reconcile.sh"
SERVICE_SRC="$DEPLOY_TREE/systemd/audiolad-author-appreciation-getcourse-reconcile.service"
TIMER_SRC="$DEPLOY_TREE/systemd/audiolad-author-appreciation-getcourse-reconcile.timer"
LOGROTATE_SRC="$DEPLOY_TREE/logrotate/audiolad-author-appreciation-getcourse-reconcile"

WRAPPER_DIR="${WRAPPER_DIR:-/usr/local/lib/audiolad}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
LOGROTATE_DIR="${LOGROTATE_DIR:-/etc/logrotate.d}"
LOG_DIR="${LOG_DIR:-/var/log/audiolad}"
STATE_DIR="${STATE_DIR:-/var/lib/audiolad}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
SKIP_SYSTEMCTL="${SKIP_SYSTEMCTL:-0}"
START_SERVICE_NOW="${START_SERVICE_NOW:-1}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

as_root() {
  if [[ "${SKIP_AS_ROOT:-0}" == "1" ]]; then
    "$@"
  elif [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

for required in "$WRAPPER_SRC" "$SERVICE_SRC" "$TIMER_SRC" "$LOGROTATE_SRC"; do
  if [[ ! -f "$required" ]]; then
    log "ERROR missing source file: $required"
    exit 1
  fi
done

as_root install -d -m 0755 "$WRAPPER_DIR" "$LOG_DIR" "$STATE_DIR"
as_root install -m 0755 "$WRAPPER_SRC" "$WRAPPER_DIR/run-author-appreciation-getcourse-reconcile.sh"
as_root install -m 0644 "$SERVICE_SRC" "$SYSTEMD_DIR/audiolad-author-appreciation-getcourse-reconcile.service"
as_root install -m 0644 "$TIMER_SRC" "$SYSTEMD_DIR/audiolad-author-appreciation-getcourse-reconcile.timer"
as_root install -m 0644 "$LOGROTATE_SRC" "$LOGROTATE_DIR/audiolad-author-appreciation-getcourse-reconcile"

if [[ "$SKIP_SYSTEMCTL" == "1" ]]; then
  log "skip systemctl=1 installed_units=1"
  exit 0
fi

if ! command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  log "WARN systemctl missing; units installed but not enabled"
  exit 0
fi

as_root "$SYSTEMCTL" daemon-reload
as_root "$SYSTEMCTL" enable --now audiolad-author-appreciation-getcourse-reconcile.timer
if [[ "$START_SERVICE_NOW" == "1" ]]; then
  as_root "$SYSTEMCTL" start audiolad-author-appreciation-getcourse-reconcile.service || \
    log "WARN immediate reconcile start failed (timer remains enabled)"
fi

log "enabled timer=audiolad-author-appreciation-getcourse-reconcile.timer"
