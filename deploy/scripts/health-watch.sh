#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/health-watch-lib.sh
source "$SCRIPT_DIR/lib/health-watch-lib.sh"

POST_DEPLOY=false
if [[ "${1:-}" == "--post-deploy" ]]; then
  POST_DEPLOY=true
fi

WATCH_SECONDS="${HEALTH_WATCH_SECONDS:-120}"
INTERVAL_SECONDS="${HEALTH_WATCH_INTERVAL:-15}"
FAIL_THRESHOLD="${HEALTH_WATCH_FAIL_THRESHOLD:-3}"
failures=0
successful_probes=0
failed_probes=0
expected_build_id=""
watch_log="$DEPLOY_LOG_DIR/health-watch-$(date -u +"%Y%m%d-%H%M%S").log"
error_log_path="/root/.pm2/logs/audiolad-error.log"
error_log_offset=0
if [[ -f "$error_log_path" ]]; then
  error_log_offset="$(wc -c < "$error_log_path" | tr -d ' ')"
fi

exec > >(tee -a "$watch_log") 2>&1

log_info "Health watch started for ${WATCH_SECONDS}s (interval ${INTERVAL_SECONDS}s)"

if [[ -f "$DEPLOY_ROOT/current/.next/BUILD_ID" ]]; then
  expected_build_id="$(tr -d '\n' < "$DEPLOY_ROOT/current/.next/BUILD_ID")"
  log_info "Expected BUILD_ID: $expected_build_id"
fi

mapfile -t baseline_pm2 < <(hw_read_pm2_metrics "$PM2_APP_NAME")
restart_before="${baseline_pm2[1]:-0}"
unstable_before="${baseline_pm2[2]:-0}"
baseline_status="${baseline_pm2[0]:-unknown}"
baseline_pid="${baseline_pm2[3]:-0}"

log_info "PM2 baseline: status=${baseline_status} restart_time=${restart_before} unstable_restarts=${unstable_before} pid=${baseline_pid}"

if [[ "$baseline_status" == "missing" ]]; then
  log_warn "PM2 baseline unavailable immediately after reload; waiting 10s before watch probes"
  sleep 10
  mapfile -t baseline_pm2 < <(hw_read_pm2_metrics "$PM2_APP_NAME")
  restart_before="${baseline_pm2[1]:-0}"
  unstable_before="${baseline_pm2[2]:-0}"
  baseline_status="${baseline_pm2[0]:-unknown}"
  baseline_pid="${baseline_pm2[3]:-0}"
  log_info "PM2 baseline retry: status=${baseline_status} restart_time=${restart_before} unstable_restarts=${unstable_before} pid=${baseline_pid}"
fi

check_once() {
  local probe_output
  probe_output="$(hw_evaluate_probe \
    "http://127.0.0.1:${PRODUCTION_PORT}" \
    "$HEALTH_PATH" \
    "$expected_build_id" \
    "$PM2_APP_NAME" \
    "$restart_before" \
    "$unstable_before" \
    "$error_log_path" \
    "$error_log_offset" 2>&1 || true)"

  local restart_after unstable_after status issues_line
  restart_after="$(printf '%s\n' "$probe_output" | awk -F= '/^restart_after=/{print $2; exit}')"
  unstable_after="$(printf '%s\n' "$probe_output" | awk -F= '/^unstable_after=/{print $2; exit}')"
  status="$(printf '%s\n' "$probe_output" | awk -F= '/^status=/{print $2; exit}')"
  issues_line="$(printf '%s\n' "$probe_output" | awk -F= '/^issues=/{print $2; exit}')"

  if [[ -z "$issues_line" ]]; then
    successful_probes=$((successful_probes + 1))
    log_info "Health watch check passed (restart_delta=$((restart_after - restart_before)) status=${status} unstable=${unstable_after})"
    return 0
  fi

  failed_probes=$((failed_probes + 1))
  log_warn "Health watch issues: ${issues_line}"
  log_warn "Diagnostics: restart_before=${restart_before} restart_after=${restart_after} restart_delta=$((restart_after - restart_before)) unstable_before=${unstable_before} unstable_after=${unstable_after} status=${status} successful_probes=${successful_probes} failed_probes=${failed_probes}"
  return 1
}

log_diagnostics_summary() {
  mapfile -t final_pm2 < <(hw_read_pm2_metrics "$PM2_APP_NAME")
  log_error "Health watch summary: restart_before=${restart_before} restart_after=${final_pm2[1]:-0} restart_delta=$((${final_pm2[1]:-0} - restart_before)) unstable_before=${unstable_before} unstable_after=${final_pm2[2]:-0} status=${final_pm2[0]:-unknown} pid=${final_pm2[3]:-0} uptime=${final_pm2[4]:-0} successful_probes=${successful_probes} failed_probes=${failed_probes}"
}

end_time=$((SECONDS + WATCH_SECONDS))
while (( SECONDS < end_time )); do
  if check_once; then
    failures=0
  else
    failures=$((failures + 1))
    if (( failures >= FAIL_THRESHOLD )); then
      log_diagnostics_summary
      log_error "Health watch failed ${failures} times in a row"
      exit 1
    fi
  fi
  sleep "$INTERVAL_SECONDS"
done

if [[ "$POST_DEPLOY" == true ]]; then
  log_info "Running final browser smoke test"
  if ! "$SCRIPT_DIR/smoke-test.sh" "https://audiolad.ru"; then
    log_diagnostics_summary
    log_error "Final browser smoke test failed during health watch"
    exit 1
  fi
fi

log_info "Health watch completed successfully (successful_probes=${successful_probes} failed_probes=${failed_probes})"
exit 0
