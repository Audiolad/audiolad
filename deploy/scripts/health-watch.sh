#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

POST_DEPLOY=false
if [[ "${1:-}" == "--post-deploy" ]]; then
  POST_DEPLOY=true
fi

WATCH_SECONDS="${HEALTH_WATCH_SECONDS:-120}"
INTERVAL_SECONDS="${HEALTH_WATCH_INTERVAL:-15}"
FAIL_THRESHOLD="${HEALTH_WATCH_FAIL_THRESHOLD:-3}"
MAX_RESTART_DELTA="${HEALTH_WATCH_MAX_RESTART_DELTA:-1}"
MAX_PID_CHANGES="${HEALTH_WATCH_MAX_PID_CHANGES:-1}"
failures=0
expected_build_id=""
watch_log="$DEPLOY_LOG_DIR/health-watch-$(date -u +"%Y%m%d-%H%M%S").log"
error_log_path="/root/.pm2/logs/audiolad-error.log"
error_log_offset=0
baseline_file="${PM2_HEALTH_BASELINE_FILE:-}"
last_pid=""
pid_changes=0

if [[ -f "$error_log_path" ]]; then
  error_log_offset="$(wc -c < "$error_log_path" | tr -d ' ')"
fi

exec > >(tee -a "$watch_log") 2>&1

log_info "Health watch started for ${WATCH_SECONDS}s (interval ${INTERVAL_SECONDS}s)"
log_info "Health watch restart policy: max_restart_delta=${MAX_RESTART_DELTA}"

if [[ -f "$DEPLOY_ROOT/current/.next/BUILD_ID" ]]; then
  expected_build_id="$(tr -d '\n' < "$DEPLOY_ROOT/current/.next/BUILD_ID")"
  log_info "Expected BUILD_ID: $expected_build_id"
fi

if [[ -z "$baseline_file" || ! -f "$baseline_file" ]]; then
  baseline_file="/tmp/audiolad-pm2-baseline-$$.json"
  log_info "Capturing PM2 baseline for standalone health watch"
  if ! pm2 jlist 2>/dev/null | node "$SCRIPT_DIR/lib/pm2-health.mjs" snapshot --app "$PM2_APP_NAME" >"$baseline_file"; then
    log_error "Failed to capture PM2 baseline snapshot"
    exit 1
  fi
fi

log_info "PM2 baseline file: $baseline_file"
cat "$baseline_file"

check_once() {
  local http_ok=true
  local http_status="unreachable"
  local build_id_match=true
  local guest_home_ok=true
  local global_error_detected=false
  local critical_runtime_error=false
  local health_body="/tmp/audiolad-health.json"
  local home_body="/tmp/audiolad-home.html"
  local pm2_jlist check_json healthy reasons current_pid combined_log

  if ! curl -fsS "http://127.0.0.1:${PRODUCTION_PORT}${HEALTH_PATH}" >"$health_body" 2>/dev/null; then
    http_ok=false
    http_status="unreachable"
  else
    http_status="200"
    if [[ -n "$expected_build_id" ]]; then
      local build_id
      build_id="$(python3 - <<'PY'
import json
from pathlib import Path
print(json.loads(Path("/tmp/audiolad-health.json").read_text()).get("buildId") or "")
PY
)"
      if [[ "$build_id" != "$expected_build_id" ]]; then
        build_id_match=false
      fi
    fi
  fi

  if ! curl -fsS "http://127.0.0.1:${PRODUCTION_PORT}/" >"$home_body" 2>/dev/null; then
    guest_home_ok=false
  elif ! grep -q "Аудио, которое помогает" "$home_body"; then
    guest_home_ok=false
  fi

  if [[ -f "$home_body" ]] && grep -Eqi "This page couldn.t load|_global-error" "$home_body"; then
    global_error_detected=true
  fi

  if [[ -f "$error_log_path" && "$error_log_offset" -ge 0 ]]; then
    if tail -c +"$((error_log_offset + 1))" "$error_log_path" 2>/dev/null | grep -Eqi "ChunkLoadError|Maximum update depth exceeded"; then
      critical_runtime_error=true
    fi
  fi

  pm2_jlist="$(pm2 jlist 2>/dev/null || true)"
  if ! check_json="$(
    printf '%s' "$pm2_jlist" | node "$SCRIPT_DIR/lib/pm2-health.mjs" watch-check \
      --app "$PM2_APP_NAME" \
      --baseline-file "$baseline_file" \
      --max-restart-delta "$MAX_RESTART_DELTA" \
      --http-ok "$http_ok" \
      --http-status "$http_status" \
      --build-id-match "$build_id_match" \
      --guest-home-ok "$guest_home_ok" \
      --global-error "$global_error_detected" \
      --critical-runtime-error "$critical_runtime_error"
  )"; then
    log_error "Health watch evaluator failed"
    return 1
  fi

  combined_log="$(printf '%s' "$check_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["log"])')"
  log_info "$combined_log"

  healthy="$(printf '%s' "$check_json" | python3 -c 'import json,sys; print("true" if json.load(sys.stdin)["healthy"] else "false")')"
  reasons="$(printf '%s' "$check_json" | python3 -c 'import json,sys; print(",".join(json.load(sys.stdin).get("reasons") or []))')"
  current_pid="$(printf '%s' "$check_json" | python3 -c 'import json,sys; pid=json.load(sys.stdin).get("pid"); print(pid if pid is not None else "")')"

  if [[ -n "$current_pid" && -n "$last_pid" && "$current_pid" != "$last_pid" ]]; then
    pid_changes=$((pid_changes + 1))
    log_warn "PM2 PID changed during health watch: ${last_pid} -> ${current_pid} (changes=${pid_changes})"
  fi
  if [[ -n "$current_pid" ]]; then
    last_pid="$current_pid"
  fi

  if (( pid_changes > MAX_PID_CHANGES )); then
    healthy="false"
    reasons="${reasons},pm2_pid_churn"
    log_warn "Health watch issues: pm2_pid_churn:${pid_changes}"
  fi

  if [[ "$healthy" != "true" ]]; then
    log_warn "Health watch issues: ${reasons}"
    return 1
  fi

  log_info "Health watch check passed"
  return 0
}

end_time=$((SECONDS + WATCH_SECONDS))
while (( SECONDS < end_time )); do
  if check_once; then
    failures=0
  else
    failures=$((failures + 1))
    if (( failures >= FAIL_THRESHOLD )); then
      log_error "Health watch failed ${failures} times in a row"
      exit 1
    fi
  fi
  sleep "$INTERVAL_SECONDS"
done

if [[ "$POST_DEPLOY" == true ]]; then
  log_info "Running final browser smoke test"
  if ! "$SCRIPT_DIR/smoke-test.sh" "https://audiolad.ru"; then
    log_error "Final browser smoke test failed during health watch"
    exit 1
  fi
fi

log_info "Health watch completed successfully"
exit 0
