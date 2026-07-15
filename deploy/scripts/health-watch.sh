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
failures=0
expected_build_id=""
watch_log="$DEPLOY_LOG_DIR/health-watch-$(date -u +"%Y%m%d-%H%M%S").log"

exec > >(tee -a "$watch_log") 2>&1

log_info "Health watch started for ${WATCH_SECONDS}s (interval ${INTERVAL_SECONDS}s)"

if [[ -f "$DEPLOY_ROOT/current/.next/BUILD_ID" ]]; then
  expected_build_id="$(tr -d '\n' < "$DEPLOY_ROOT/current/.next/BUILD_ID")"
  log_info "Expected BUILD_ID: $expected_build_id"
fi

check_once() {
  local issues=()

  if ! curl -fsS "http://127.0.0.1:${PRODUCTION_PORT}${HEALTH_PATH}" >/tmp/audiolad-health.json 2>/dev/null; then
    issues+=("health_endpoint_unreachable")
  else
    local build_id
    build_id="$(python3 - <<'PY'
import json
from pathlib import Path
print(json.loads(Path("/tmp/audiolad-health.json").read_text()).get("buildId") or "")
PY
)"
    if [[ -n "$expected_build_id" && "$build_id" != "$expected_build_id" ]]; then
      issues+=("build_id_mismatch:${build_id}")
    fi
  fi

  if ! curl -fsS "http://127.0.0.1:${PRODUCTION_PORT}/" | grep -q "Аудио, которое помогает"; then
    issues+=("guest_home_marker_missing")
  fi

  if curl -fsS "http://127.0.0.1:${PRODUCTION_PORT}/" | grep -Eqi "This page couldn.t load|_global-error"; then
    issues+=("global_error_detected")
  fi

  if ! pm2 describe "$PM2_APP_NAME" 2>/dev/null | grep -q "status.*online"; then
    issues+=("pm2_not_online")
  fi

  local restarts
  restarts="$(pm2 jlist 2>/dev/null | python3 - <<'PY'
import json,sys
apps=json.load(sys.stdin)
for app in apps:
    if app.get("name")=="audiolad":
        print(app.get("pm2_env",{}).get("restart_time",0))
        break
PY
)"
  if [[ -n "$restarts" && "$restarts" -gt 3 ]]; then
    issues+=("pm2_restart_loop:${restarts}")
  fi

  if tail -n 100 /root/.pm2/logs/audiolad-error.log 2>/dev/null | grep -Eqi "ChunkLoadError|Maximum update depth exceeded"; then
    issues+=("critical_runtime_error_in_logs")
  fi

  if ((${#issues[@]} > 0)); then
    log_warn "Health watch issues: ${issues[*]}"
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
