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
SERVICE_UNIT="audiolad-author-appreciation-getcourse-reconcile.service"
TIMER_UNIT="audiolad-author-appreciation-getcourse-reconcile.timer"

WRAPPER_DIR="${WRAPPER_DIR:-/usr/local/lib/audiolad}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
LOGROTATE_DIR="${LOGROTATE_DIR:-/etc/logrotate.d}"
LOG_DIR="${LOG_DIR:-/var/log/audiolad}"
STATE_DIR="${STATE_DIR:-/var/lib/audiolad}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/author-appreciation-getcourse-reconcile.log}"
SYSTEMCTL="${SYSTEMCTL:-systemctl}"
SKIP_SYSTEMCTL="${SKIP_SYSTEMCTL:-0}"
START_SERVICE_NOW="${START_SERVICE_NOW:-1}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

log_service_result() {
  local label="$1"
  if ! as_root "$SYSTEMCTL" show "$SERVICE_UNIT" \
    -p ActiveState -p Result -p ExecMainStatus -p ExecMainCode \
    -p ExecMainStartTimestamp -p ExecMainExitTimestamp \
    -p InvocationID; then
    log "WARN ${label} service_show_unavailable unit=${SERVICE_UNIT}"
  fi
}

log_reconcile_summary() {
  if [[ ! -r "$LOG_FILE" ]]; then
    log "WARN reconcile_log_unreadable path=${LOG_FILE}"
    return 0
  fi
  local summary
  summary="$(
    awk '/APPRECIATION_RECONCILE / { line=$0 } END { print line }' "$LOG_FILE" \
      | sed -E \
        -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
        -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
        -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
        -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g'
  )"
  if [[ -n "$summary" ]]; then
    log "reconcile_summary ${summary}"
  else
    log "WARN reconcile_summary missing path=${LOG_FILE}"
  fi
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
DIAGNOSE_SRC="$SCRIPT_DIR/audiolad-reconcile-diagnose.sh"
if [[ -f "$DIAGNOSE_SRC" ]]; then
  as_root install -m 0755 "$DIAGNOSE_SRC" "${WRAPPER_DIR}/audiolad-reconcile-diagnose.sh"
  if [[ "${SKIP_AS_ROOT:-0}" != "1" ]]; then
    as_root install -m 0755 "$DIAGNOSE_SRC" "/usr/local/sbin/audiolad-reconcile-diagnose"
  fi
fi
as_root install -m 0644 "$SERVICE_SRC" "$SYSTEMD_DIR/${SERVICE_UNIT}"
as_root install -m 0644 "$TIMER_SRC" "$SYSTEMD_DIR/${TIMER_UNIT}"
as_root install -m 0644 "$LOGROTATE_SRC" "$LOGROTATE_DIR/audiolad-author-appreciation-getcourse-reconcile"

if [[ "$SKIP_SYSTEMCTL" == "1" ]]; then
  log "skip systemctl=1 installed_units=1"
  exit 0
fi

if ! command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  log "ERROR systemctl missing; reconcile units installed but not enabled"
  exit 1
fi

as_root "$SYSTEMCTL" daemon-reload
if ! as_root "$SYSTEMCTL" enable --now "$TIMER_UNIT"; then
  log "ERROR timer enable failed unit=${TIMER_UNIT}"
  exit 1
fi

if [[ "$START_SERVICE_NOW" == "1" ]]; then
  local_start_exit=0
  if ! as_root "$SYSTEMCTL" start "$SERVICE_UNIT"; then
    local_start_exit=$?
  fi
  log "immediate reconcile systemd start exit=${local_start_exit}"
  log_service_result "after_immediate_start"
  log_reconcile_summary
  if [[ "$local_start_exit" -ne 0 ]]; then
    log "ERROR immediate reconcile start failed exit=${local_start_exit} unit=${SERVICE_UNIT}"
    exit 1
  fi
fi

log "enabled timer=${TIMER_UNIT}"
