#!/usr/bin/env bash
# Shared health-watch probe helpers (testable with mocked PM2 / HTTP inputs).
set -Eeuo pipefail

HEALTH_WATCH_MAX_RESTART_DELTA="${HEALTH_WATCH_MAX_RESTART_DELTA:-2}"

hw_read_pm2_metrics() {
  local app_name="${1:-audiolad}"
  local json_source="${HW_PM2_JLIST_JSON:-}"
  local attempt metrics_line

  if [[ -n "$json_source" && -f "$json_source" ]]; then
    python3 - "$app_name" "$json_source" <<'PY'
import json, sys
app_name, path = sys.argv[1], sys.argv[2]
apps = json.load(open(path))
for app in apps:
    if app.get("name") == app_name:
        env = app.get("pm2_env") or {}
        monit = app.get("monit") or {}
        print(env.get("status", "unknown"))
        print(env.get("restart_time", 0))
        print(env.get("unstable_restarts", 0))
        print(app.get("pid", 0))
        print(monit.get("uptime", env.get("pm_uptime", 0)))
        raise SystemExit
print("missing")
print(0)
print(0)
print(0)
print(0)
PY
    return
  fi

  for attempt in 1 2 3; do
    mapfile -t metrics_line < <(pm2 jlist 2>/dev/null | python3 - "$app_name" <<'PY'
import json, sys
app_name = sys.argv[1]
raw = sys.stdin.read().strip()
if not raw:
    print("missing"); print(0); print(0); print(0); print(0); raise SystemExit
apps = json.loads(raw)
for app in apps:
    if app.get("name") == app_name:
        env = app.get("pm2_env") or {}
        monit = app.get("monit") or {}
        print(env.get("status", "unknown"))
        print(env.get("restart_time", 0))
        print(env.get("unstable_restarts", 0))
        print(app.get("pid", 0))
        print(monit.get("uptime", env.get("pm_uptime", 0)))
        raise SystemExit
print("missing")
print(0)
print(0)
print(0)
print(0)
PY
)
    if [[ "${metrics_line[0]:-missing}" != "missing" ]]; then
      printf '%s\n' "${metrics_line[@]}"
      return
    fi
    sleep 2
  done

  if pm2 describe "$app_name" 2>/dev/null | grep -q "status.*online"; then
    local restart_time unstable_restarts pid
    restart_time="$(pm2 jlist 2>/dev/null | python3 -c "import json,sys
raw=sys.stdin.read().strip()
apps=json.loads(raw) if raw else []
for app in apps:
    if app.get('name')=='$app_name':
        print(app.get('pm2_env',{}).get('restart_time',0)); break
else: print(0)" 2>/dev/null || echo 0)"
    unstable_restarts="$(pm2 describe "$app_name" 2>/dev/null | awk -F'│' '/unstable restarts/ {gsub(/ /,"",$3); print $3; exit}')"
    pid="$(pm2 describe "$app_name" 2>/dev/null | awk -F'│' '/^│ pid / {gsub(/ /,"",$3); print $3; exit}')"
    printf '%s\n' "online" "${restart_time:-0}" "${unstable_restarts:-0}" "${pid:-0}" "0"
    return
  fi

  printf '%s\n' "missing" "0" "0" "0" "0"
}

hw_probe_health_endpoint() {
  local base_url="$1"
  local health_path="$2"
  local expected_build_id="${3:-}"
  local out_file="${4:-/tmp/audiolad-health.json}"

  if [[ -n "${HW_CURL_HEALTH_SCRIPT:-}" && -x "$HW_CURL_HEALTH_SCRIPT" ]]; then
    "$HW_CURL_HEALTH_SCRIPT" "$base_url" "$health_path" "$expected_build_id" "$out_file"
    return $?
  fi

  if ! curl -fsS "${base_url}${health_path}" >"$out_file" 2>/dev/null; then
    return 1
  fi

  if [[ -n "$expected_build_id" ]]; then
    local build_id
    build_id="$(python3 - <<PY
import json
from pathlib import Path
print(json.loads(Path("$out_file").read_text()).get("buildId") or "")
PY
)"
    [[ "$build_id" == "$expected_build_id" ]]
    return $?
  fi

  return 0
}

hw_probe_home_marker() {
  local base_url="$1"

  if [[ -n "${HW_CURL_HOME_SCRIPT:-}" && -x "$HW_CURL_HOME_SCRIPT" ]]; then
    "$HW_CURL_HOME_SCRIPT" "$base_url"
    return $?
  fi

  curl -fsS "${base_url}/" | grep -q "Аудио, которое помогает"
}

hw_evaluate_restart_window() {
  local status="$1"
  local restart_before="$2"
  local restart_after="$3"
  local unstable_before="$4"
  local unstable_after="$5"
  local max_delta="${6:-$HEALTH_WATCH_MAX_RESTART_DELTA}"

  local issues=()
  local restart_delta=$((restart_after - restart_before))
  local unstable_delta=$((unstable_after - unstable_before))

  if [[ "$status" != "online" ]]; then
    issues+=("pm2_status:${status}")
  fi

  if (( restart_delta > max_delta )); then
    issues+=("pm2_restart_delta:${restart_delta}")
  fi

  if (( unstable_delta > 0 )); then
    issues+=("pm2_unstable_restarts_delta:${unstable_delta}")
  fi

  if ((${#issues[@]} > 0)); then
    printf '%s\n' "${issues[@]}"
    return 1
  fi

  return 0
}

hw_evaluate_probe() {
  local base_url="$1"
  local health_path="$2"
  local expected_build_id="$3"
  local app_name="$4"
  local restart_before="$5"
  local unstable_before="$6"
  local error_log_path="${7:-}"
  local error_log_offset="${8:-0}"

  local issues=()
  local health_file="${HW_HEALTH_JSON_FILE:-/tmp/audiolad-health.json}"

  if ! hw_probe_health_endpoint "$base_url" "$health_path" "$expected_build_id" "$health_file"; then
    issues+=("health_endpoint_unreachable")
  fi

  if ! hw_probe_home_marker "$base_url"; then
    issues+=("guest_home_marker_missing")
  fi

  if [[ -z "${HW_CURL_HOME_SCRIPT:-}" ]]; then
    if curl -fsS "${base_url}/" | grep -Eqi "This page couldn.t load|_global-error"; then
      issues+=("global_error_detected")
    fi
  fi

  mapfile -t pm2_lines < <(hw_read_pm2_metrics "$app_name")
  local status="${pm2_lines[0]:-missing}"
  local restart_after="${pm2_lines[1]:-0}"
  local unstable_after="${pm2_lines[2]:-0}"
  local pid_after="${pm2_lines[3]:-0}"
  local uptime_after="${pm2_lines[4]:-0}"

  mapfile -t restart_issues < <(hw_evaluate_restart_window "$status" "$restart_before" "$restart_after" "$unstable_before" "$unstable_after" "$HEALTH_WATCH_MAX_RESTART_DELTA" || true)
  issues+=("${restart_issues[@]}")

  if [[ -n "$error_log_path" && -f "$error_log_path" && "$error_log_offset" -ge 0 ]]; then
    if tail -c +"$((error_log_offset + 1))" "$error_log_path" 2>/dev/null | grep -Eqi "ChunkLoadError|Maximum update depth exceeded"; then
      issues+=("critical_runtime_error_since_watch_start")
    fi
  fi

  printf 'restart_before=%s\n' "$restart_before"
  printf 'restart_after=%s\n' "$restart_after"
  printf 'restart_delta=%s\n' "$((restart_after - restart_before))"
  printf 'unstable_before=%s\n' "$unstable_before"
  printf 'unstable_after=%s\n' "$unstable_after"
  printf 'status=%s\n' "$status"
  printf 'pid=%s\n' "$pid_after"
  printf 'uptime=%s\n' "$uptime_after"

  if ((${#issues[@]} > 0)); then
    printf 'issues=%s\n' "${issues[*]}"
    return 1
  fi

  printf 'issues=\n'
  return 0
}
