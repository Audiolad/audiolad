#!/usr/bin/env bash
# Install and enable the application email outbox timer from the candidate
# release. Missing units or a failed enable must fail the caller deploy.
# Does not restart PM2 / Nginx / Docker and does not send mail itself.
# Does not create or reload author sale, partner, or moderation units.
set -Eeuo pipefail

if [[ -n "${DEPLOY_TREE:-}" && -d "$DEPLOY_TREE" ]]; then
  DEPLOY_TREE="$(cd "$DEPLOY_TREE" && pwd -P)"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  DEPLOY_TREE="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi

WRAPPER_SRC="$DEPLOY_TREE/scripts/run-application-email-outbox.sh"
SERVICE_SRC="$DEPLOY_TREE/systemd/audiolad-application-email-outbox.service"
TIMER_SRC="$DEPLOY_TREE/systemd/audiolad-application-email-outbox.timer"
LOGROTATE_SRC="$DEPLOY_TREE/logrotate/audiolad-application-email-outbox"
SERVICE_UNIT="audiolad-application-email-outbox.service"
TIMER_UNIT="audiolad-application-email-outbox.timer"

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

if [[ ! -x "$WRAPPER_SRC" ]]; then
  log "ERROR canonical_wrapper_invalid path=$WRAPPER_SRC"
  exit 1
fi

as_root install -d -m 0755 "$WRAPPER_DIR" "$LOG_DIR" "$SYSTEMD_DIR" "$LOGROTATE_DIR"
as_root install -m 0755 "$WRAPPER_SRC" "$WRAPPER_DIR/run-application-email-outbox.sh"
as_root install -m 0644 "$SERVICE_SRC" "$SYSTEMD_DIR/${SERVICE_UNIT}"
as_root install -m 0644 "$TIMER_SRC" "$SYSTEMD_DIR/${TIMER_UNIT}"
as_root install -m 0644 "$LOGROTATE_SRC" "$LOGROTATE_DIR/audiolad-application-email-outbox"

if [[ "$SKIP_SYSTEMCTL" == "1" ]]; then
  log "application_email_outbox_installed skip_systemctl=1 timer=${TIMER_UNIT}"
  exit 0
fi

if ! command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  log "ERROR systemctl missing; application email outbox units installed but not enabled"
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

log "application_email_outbox_timer_enabled unit=${TIMER_UNIT}"
