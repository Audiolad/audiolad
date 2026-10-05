#!/usr/bin/env bash
# Install and enable the SEO reservation day-5 reminder timer from the candidate
# release. Missing units or a failed enable must fail the caller deploy.
# Does not restart PM2 / Nginx / Docker and does not send mail itself.
set -Eeuo pipefail

if [[ -n "${DEPLOY_TREE:-}" && -d "$DEPLOY_TREE" ]]; then
  DEPLOY_TREE="$(cd "$DEPLOY_TREE" && pwd -P)"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  DEPLOY_TREE="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi

WRAPPER_SRC="$DEPLOY_TREE/scripts/run-seo-reservation-5d-reminder.sh"
SERVICE_SRC="$DEPLOY_TREE/systemd/audiolad-seo-reservation-5d-reminder.service"
TIMER_SRC="$DEPLOY_TREE/systemd/audiolad-seo-reservation-5d-reminder.timer"
LOGROTATE_SRC="$DEPLOY_TREE/logrotate/audiolad-seo-reservation-5d-reminder"
SERVICE_UNIT="audiolad-seo-reservation-5d-reminder.service"
TIMER_UNIT="audiolad-seo-reservation-5d-reminder.timer"

WRAPPER_DIR="${WRAPPER_DIR:-/usr/local/lib/audiolad}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
LOGROTATE_DIR="${LOGROTATE_DIR:-/etc/logrotate.d}"
LOG_DIR="${LOG_DIR:-/var/log/audiolad}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
SKIP_SYSTEMCTL="${SKIP_SYSTEMCTL:-0}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

as_root() {
  if [[ "${SKIP_AS_ROOT:-0}" == "1" ]]; then
    "$@"
  elif [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

for required in "$WRAPPER_SRC" "$SERVICE_SRC" "$TIMER_SRC" "$LOGROTATE_SRC"; do
  if [[ ! -f "$required" ]]; then
    log "ERROR missing source file: $required"
    exit 1
  fi
done

if [[ ! -x "$WRAPPER_SRC" ]]; then
  log "ERROR canonical_wrapper_invalid path=$WRAPPER_SRC"
  exit 1
fi

as_root install -d -m 0755 "$WRAPPER_DIR" "$LOG_DIR" "$SYSTEMD_DIR" "$LOGROTATE_DIR"
as_root install -m 0755 "$WRAPPER_SRC" "$WRAPPER_DIR/run-seo-reservation-5d-reminder.sh"
as_root install -m 0644 "$SERVICE_SRC" "$SYSTEMD_DIR/${SERVICE_UNIT}"
as_root install -m 0644 "$TIMER_SRC" "$SYSTEMD_DIR/${TIMER_UNIT}"
as_root install -m 0644 "$LOGROTATE_SRC" "$LOGROTATE_DIR/audiolad-seo-reservation-5d-reminder"

if [[ "$SKIP_SYSTEMCTL" == "1" ]]; then
  log "seo_reservation_5d_reminder_installed skip_systemctl=1 timer=${TIMER_UNIT}"
  exit 0
fi

if ! command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  log "ERROR systemctl missing; seo reservation 5d reminder units installed but not enabled"
  exit 1
fi

as_root "$SYSTEMCTL" daemon-reload
if ! as_root "$SYSTEMCTL" enable --now "$TIMER_UNIT"; then
  log "ERROR timer enable failed unit=${TIMER_UNIT}"
  exit 1
fi

if ! as_root "$SYSTEMCTL" is-enabled "$TIMER_UNIT" >/dev/null; then
  log "ERROR timer is-enabled failed unit=${TIMER_UNIT}"
  exit 1
fi

if ! as_root "$SYSTEMCTL" is-active "$TIMER_UNIT" >/dev/null; then
  log "ERROR timer is-active failed unit=${TIMER_UNIT}"
  exit 1
fi

log "seo_reservation_5d_reminder_timer_enabled unit=${TIMER_UNIT}"
