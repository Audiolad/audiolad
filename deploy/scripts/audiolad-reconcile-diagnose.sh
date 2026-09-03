#!/usr/bin/env bash
# Read-only production diagnostics for GetCourse appreciation reconcile.
# Installed on deploy for operators / GitHub Actions DO_NOT_DEPLOY path.
# Never invokes audiolad-deploy, npm reconcile, or GetCourse Export API.
set -Eeuo pipefail

UNIT_SERVICE="audiolad-author-appreciation-getcourse-reconcile.service"
UNIT_TIMER="audiolad-author-appreciation-getcourse-reconcile.timer"
LOG_FILE="/var/log/audiolad/author-appreciation-getcourse-reconcile.log"
COOLDOWN_FILE="/var/lib/audiolad/author-appreciation-getcourse-reconcile.stamp"
DEPLOY_COMMIT_FILE="/var/www/audiolad-deploy/current/.deploy-commit"

redact_stream() {
  sed -E \
    -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
    -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
    -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g'
}

section() {
  printf '\n===== %s =====\n' "$1"
}

try_cmd() {
  local label="$1"
  shift
  section "${label}"
  if "$@" 2>&1 | redact_stream; then
    return 0
  fi
  printf 'BLOCKED exit=%s label=%s\n' "$?" "${label}"
  return 0
}

section "DIAGNOSTIC_MODE"
echo "mode=read_only"
echo "audiolad_deploy=NOT_INVOKED"

section "PRODUCTION_RELEASE"
if [[ -r "${DEPLOY_COMMIT_FILE}" ]]; then
  tr -d '[:space:]' < "${DEPLOY_COMMIT_FILE}"
else
  echo "deploy_commit_unreadable path=${DEPLOY_COMMIT_FILE}"
fi

try_cmd "TIMER_IS_ACTIVE" systemctl is-active "${UNIT_TIMER}"
try_cmd "TIMER_IS_ENABLED" systemctl is-enabled "${UNIT_TIMER}"
try_cmd "TIMER_SHOW" systemctl show "${UNIT_TIMER}" \
  -p ActiveState -p UnitFileState -p NextElapseUSecRealtime -p LastTriggerUSec \
  -p Triggers -p Unit
try_cmd "TIMER_LIST" systemctl list-timers "${UNIT_TIMER}" --all --no-pager
try_cmd "SERVICE_SHOW" systemctl show "${UNIT_SERVICE}" \
  -p ActiveState -p Result -p ExecMainStatus -p ExecMainCode \
  -p ExecMainStartTimestamp -p ExecMainExitTimestamp -p ExecMainPID \
  -p InvocationID -p StateChangeTimestamp
try_cmd "SERVICE_STATUS" systemctl status "${UNIT_SERVICE}" --no-pager -l
try_cmd "JOURNAL_SERVICE_TAIL" journalctl -u "${UNIT_SERVICE}" -n 80 --no-pager
try_cmd "JOURNAL_TIMER_TAIL" journalctl -u "${UNIT_TIMER}" -n 40 --no-pager

section "RECONCILE_COOLDOWN_STAMP"
if [[ -r "${COOLDOWN_FILE}" ]]; then
  echo -n "cooldown_last_started_ms="
  tr -d '[:space:]' < "${COOLDOWN_FILE}"
  echo
else
  echo "cooldown_stamp_unreadable path=${COOLDOWN_FILE}"
fi

section "RECONCILE_LOG_FILE"
if [[ -r "${LOG_FILE}" ]]; then
  tail -n 120 "${LOG_FILE}" | redact_stream
else
  echo "log_unreadable path=${LOG_FILE}"
fi

section "RECONCILE_LOG_SUMMARY"
if [[ -r "${LOG_FILE}" ]]; then
  awk '/APPRECIATION_RECONCILE |attempted=|author_appreciation_getcourse_reconcile/' "${LOG_FILE}" \
    | tail -n 40 \
    | redact_stream
fi

section "DIAGNOSTIC_END"
