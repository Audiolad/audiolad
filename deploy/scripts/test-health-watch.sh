#!/usr/bin/env bash
# Unit-style tests for health-watch restart window logic (no production PM2/symlink changes).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/health-watch-lib.sh
source "$SCRIPT_DIR/lib/health-watch-lib.sh"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass_count=0
fail_count=0

pass() {
  pass_count=$((pass_count + 1))
  echo "PASS: $1"
}

fail_test() {
  fail_count=$((fail_count + 1))
  echo "FAIL: $1" >&2
}

write_pm2_json() {
  local file="$1"
  local status="$2"
  local restart_time="$3"
  local unstable_restarts="$4"
  local pid="${5:-12345}"
  local uptime="${6:-60000}"
  cat >"$file" <<JSON
[
  {
    "name": "audiolad",
    "pid": ${pid},
    "pm2_env": {
      "status": "${status}",
      "restart_time": ${restart_time},
      "unstable_restarts": ${unstable_restarts}
    },
    "monit": { "uptime": ${uptime} }
  }
]
JSON
}

write_ok_health_curl() {
  local file="$1"
  cat >"$file" <<'SH'
#!/usr/bin/env bash
echo '{"status":"ok","buildId":"test-build"}' > "$4"
exit 0
SH
  chmod +x "$file"
}

write_ok_home_curl() {
  local file="$1"
  cat >"$file" <<'SH'
#!/usr/bin/env bash
exit 0
SH
  chmod +x "$file"
}

write_fail_health_curl() {
  local file="$1"
  cat >"$file" <<'SH'
#!/usr/bin/env bash
exit 1
SH
  chmod +x "$file"
}

run_probe() {
  local pm2_file="$1"
  local restart_before="$2"
  local unstable_before="$3"
  local health_script="${4:-}"
  local home_script="${5:-}"

  export HW_PM2_JLIST_JSON="$pm2_file"
  export HW_CURL_HEALTH_SCRIPT="$health_script"
  export HW_CURL_HOME_SCRIPT="$home_script"
  export HW_HEALTH_JSON_FILE="$TMP_DIR/health.json"

  hw_evaluate_probe \
    "http://127.0.0.1:3000" \
    "/api/health/build" \
    "test-build" \
    "audiolad" \
    "$restart_before" \
    "$unstable_before" \
    "" \
    "0"
}

health_ok="$TMP_DIR/health-ok.sh"
home_ok="$TMP_DIR/home-ok.sh"
health_fail="$TMP_DIR/health-fail.sh"
write_ok_health_curl "$health_ok"
write_ok_home_curl "$home_ok"
write_fail_health_curl "$health_fail"

# 1. restart_time 4 -> 4: PASS
pm2="$TMP_DIR/pm2-1.json"
write_pm2_json "$pm2" "online" 4 0
if run_probe "$pm2" 4 0 "$health_ok" "$home_ok"; then
  pass "restart_time stable at 4"
else
  fail_test "restart_time stable at 4"
fi

# 2. restart_time 4 -> 5, stable: PASS (delta 1)
write_pm2_json "$pm2" "online" 5 0
if run_probe "$pm2" 4 0 "$health_ok" "$home_ok"; then
  pass "single restart delta after reload"
else
  fail_test "single restart delta after reload"
fi

# 3. several new restarts in window: FAIL
write_pm2_json "$pm2" "online" 8 0
if run_probe "$pm2" 4 0 "$health_ok" "$home_ok"; then
  fail_test "restart delta above threshold should fail"
else
  pass "restart delta above threshold fails"
fi

# 4. PM2 errored: FAIL
write_pm2_json "$pm2" "errored" 4 0
if run_probe "$pm2" 4 0 "$health_ok" "$home_ok"; then
  fail_test "pm2 errored should fail"
else
  pass "pm2 errored fails"
fi

# 5. health endpoint fails once then recovers: single probe fail only
write_pm2_json "$pm2" "online" 4 0
if run_probe "$pm2" 4 0 "$health_fail" "$home_ok"; then
  fail_test "failed health probe should fail check"
else
  pass "single failed health probe fails one check"
fi
if run_probe "$pm2" 4 0 "$health_ok" "$home_ok"; then
  pass "health recovers on next probe"
else
  fail_test "health recovers on next probe"
fi

# 6. consecutive health failures: simulate FAIL_THRESHOLD externally
consecutive=0
write_pm2_json "$pm2" "online" 4 0
for _ in 1 2 3; do
  if run_probe "$pm2" 4 0 "$health_fail" "$home_ok"; then
    consecutive=0
  else
    consecutive=$((consecutive + 1))
  fi
done
if (( consecutive >= 3 )); then
  pass "three consecutive health failures accumulate"
else
  fail_test "three consecutive health failures accumulate"
fi

# 7. stable release after reload (4->5, unstable 0): PASS
write_pm2_json "$pm2" "online" 5 0 99999 120000
if run_probe "$pm2" 4 0 "$health_ok" "$home_ok"; then
  pass "stable release after reload"
else
  fail_test "stable release after reload"
fi

# 8. candidate failure before symlink switch — deploy.sh contract (static check)
if grep -q 'Candidate health check failed' "$SCRIPT_DIR/deploy.sh" && grep -q 'atomic_symlink "$RELEASE_DIR" "$DEPLOY_ROOT/current"' "$SCRIPT_DIR/deploy.sh"; then
  pass "deploy keeps production symlink until candidate passes"
else
  fail_test "deploy keeps production symlink until candidate passes"
fi

if (( fail_count > 0 )); then
  echo "health-watch tests: ${pass_count} passed, ${fail_count} failed" >&2
  exit 1
fi

echo "health-watch tests: ${pass_count} passed"
exit 0
