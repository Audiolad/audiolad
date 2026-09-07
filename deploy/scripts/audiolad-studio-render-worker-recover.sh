#!/usr/bin/env bash
# Ops-only Studio render-worker clean restart for operators / GHA
# confirm=OPS_STUDIO_WORKER_RECOVER. Never invokes audiolad-deploy, never runs
# deploy.sh, never touches nginx or the current/previous symlink. Never prints
# env file contents or secret values. Do not load .env.production in this
# shell — the worker loads env via Next.js loadEnvConfig (#353).
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
SHARED_ENV_PRODUCTION="${DEPLOY_ROOT}/shared/.env.production"
PM2_APP_NAME="audiolad-studio-render-worker"
ECOSYSTEM_REL="deploy/studio-render-worker.ecosystem.config.cjs"
SURVIVE_SECONDS="${AUDIOLAD_STUDIO_WORKER_SURVIVE_SECONDS:-166}"
ONLINE_TIMEOUT_SECONDS="${AUDIOLAD_STUDIO_WORKER_ONLINE_TIMEOUT_SECONDS:-60}"
POLL_SECONDS="${AUDIOLAD_STUDIO_WORKER_POLL_SECONDS:-5}"
ENV_BOOTSTRAP_SECONDS="${AUDIOLAD_STUDIO_WORKER_ENV_BOOTSTRAP_SECONDS:-30}"
ENV_BOOTSTRAP_POLL_SECONDS="${AUDIOLAD_STUDIO_WORKER_ENV_BOOTSTRAP_POLL_SECONDS:-2}"
DB_CONTAINER="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"

ENV_FILE_OWNER_GROUP_MODE=""
DEPLOY_CAN_READ_ENV="NO"
ENV_PERMISSIONS=""
ACTIVE_RENDER_JOBS_BEFORE="UNKNOWN"
WORKER_CLEAN_START="NO"
FRESH_ENV_READY_LOG="NO"
WORKER_RESTARTS="UNKNOWN"
WORKER_PID=""
RESTART_COUNT_STABLE="NO"
SURVIVED_OVER_2_5_MIN="NO"
RENDER_SMOKE="FAIL"
ACCEPTANCE="FAILED"
CUTOVER="NO"
AUDIOLAD_DEPLOY="NOT_INVOKED"

if ! declare -F redact_stream >/dev/null 2>&1; then
  redact_stream() {
    sed -E \
      -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
      -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
      -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
      -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g'
  }
fi

redact_studio_stream() {
  redact_stream | sed -E \
    -e 's#https?://[^[:space:]\"'\'']+#[redacted-url]#g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted-jwt]/g'
}

if ! declare -F section >/dev/null 2>&1; then
  section() {
    printf '\n===== %s =====\n' "$1"
  }
fi

print_final_flags() {
  printf '%s\n' "ENV PERMISSIONS = ${ENV_PERMISSIONS:-${ENV_FILE_OWNER_GROUP_MODE} READ=${DEPLOY_CAN_READ_ENV}}"
  printf '%s\n' "FRESH ENV READY LOG = ${FRESH_ENV_READY_LOG}"
  printf '%s\n' "WORKER CLEAN START = ${WORKER_CLEAN_START}"
  printf '%s\n' "RESTART COUNT STABLE = ${RESTART_COUNT_STABLE}"
  printf '%s\n' "SURVIVED >2.5 MIN = ${SURVIVED_OVER_2_5_MIN}"
  printf '%s\n' "RENDER SMOKE = ${RENDER_SMOKE}"
  printf '%s\n' "#353 PRODUCTION ACCEPTANCE = ${ACCEPTANCE}"
  printf '%s\n' "ACTIVE RENDER JOBS BEFORE = ${ACTIVE_RENDER_JOBS_BEFORE}"
  printf '%s\n' "CUTOVER = ${CUTOVER}"
  printf '%s\n' "CUTOVER=NO"
  printf '%s\n' "audiolad_deploy = ${AUDIOLAD_DEPLOY}"
}

fail_recover() {
  local message="$1"
  section "STUDIO_RENDER_WORKER_RECOVER_FAILED"
  printf '%s\n' "${message}" | redact_studio_stream
  ACCEPTANCE="FAILED"
  print_final_flags
  return 1
}

print_pm2_recover_fields() {
  python3 -c '
import json, sys
name = "audiolad-studio-render-worker"
try:
    procs = json.load(sys.stdin)
except Exception:
    print("status=missing")
    print("restart_time=")
    print("pid=")
    print("out_log=")
    print("error_log=")
    raise SystemExit(0)
if not isinstance(procs, list):
    print("status=missing")
    print("restart_time=")
    print("pid=")
    print("out_log=")
    print("error_log=")
    raise SystemExit(0)
for proc in procs:
    if not isinstance(proc, dict) or proc.get("name") != name:
        continue
    env = proc.get("pm2_env") if isinstance(proc.get("pm2_env"), dict) else {}
    print("status=%s" % env.get("status", ""))
    print("restart_time=%s" % env.get("restart_time", ""))
    print("pid=%s" % proc.get("pid", env.get("pm_pid", "")))
    print("out_log=%s" % env.get("pm_out_log_path", ""))
    print("error_log=%s" % env.get("pm_err_log_path", ""))
    raise SystemExit(0)
print("status=missing")
print("restart_time=")
print("pid=")
print("out_log=")
print("error_log=")
'
}

read_pm2_recover_fields() {
  local raw=""
  if ! command -v pm2 >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "status=missing"
    printf '%s\n' "restart_time="
    printf '%s\n' "pid="
    printf '%s\n' "out_log="
    printf '%s\n' "error_log="
    return 0
  fi
  set +e
  raw="$(pm2 jlist 2>/dev/null | print_pm2_recover_fields)"
  set -e
  if [[ -z "${raw}" ]]; then
    printf '%s\n' "status=missing"
    printf '%s\n' "restart_time="
    printf '%s\n' "pid="
    printf '%s\n' "out_log="
    printf '%s\n' "error_log="
    return 0
  fi
  printf '%s\n' "${raw}" | redact_studio_stream
}

pm2_field() {
  local fields="$1"
  local key="$2"
  printf '%s\n' "${fields}" | awk -F= -v key="${key}" '$1==key {print substr($0, index($0,"=")+1); exit}'
}

filter_worker_log_lines() {
  awk '/studio_render_env_ready|environment_missing|hasNextPublic|hasSupabase|redacted/'
}

docker_bin() {
  if [[ -n "${AUDIOLAD_DOCKER_BIN:-}" ]]; then
    printf '%s\n' "${AUDIOLAD_DOCKER_BIN}"
    return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    printf '%s\n' "docker"
    return 0
  fi
  return 1
}

count_active_studio_render_jobs_docker() {
  local bin=""
  local raw=""
  local code=0
  if ! bin="$(docker_bin)"; then
    return 1
  fi
  set +e
  raw="$(
    "${bin}" exec "${DB_CONTAINER}" \
      psql -U postgres -d postgres -tA -c \
      "SELECT count(*) FROM public.studio_render_jobs WHERE status IN ('queued', 'processing');"
  )"
  code=$?
  set -e
  raw="$(printf '%s' "${raw}" | tr -d '[:space:]')"
  if [[ "${code}" -eq 0 && "${raw}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "${raw}"
    return 0
  fi
  return 1
}

count_active_studio_render_jobs_node() {
  local dir="$1"
  local probe=""
  local output=""
  local code=0
  local line=""
  local count=""
  if [[ ! -d "${dir}" ]]; then
    return 1
  fi
  probe="$(mktemp)"
  cat >"${probe}" <<'JS'
const silent = { info() {}, error() {} };
const dir = process.argv[2];
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(dir, false, silent, true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("ACTIVE_RENDER_JOBS_COUNT=UNAVAILABLE");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const service = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const timer = setTimeout(() => {
  console.log("ACTIVE_RENDER_JOBS_COUNT=UNAVAILABLE");
  process.exit(2);
}, 20000);
service
  .from("studio_render_jobs")
  .select("id", { count: "exact", head: true })
  .in("status", ["queued", "processing"])
  .then(({ count, error }) => {
    clearTimeout(timer);
    if (error || typeof count !== "number") {
      console.log("ACTIVE_RENDER_JOBS_COUNT=UNAVAILABLE");
      process.exit(2);
    }
    console.log("ACTIVE_RENDER_JOBS_COUNT=" + count);
  })
  .catch(() => {
    clearTimeout(timer);
    console.log("ACTIVE_RENDER_JOBS_COUNT=UNAVAILABLE");
    process.exit(2);
  });
JS
  set +e
  output="$(
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    export NODE_ENV=production
    export NODE_PATH="${dir}/node_modules${NODE_PATH:+:${NODE_PATH}}"
    cd "${dir}"
    node "${probe}" "${dir}" 2>/dev/null
  )"
  code=$?
  set -e
  rm -f "${probe}"
  while IFS= read -r line; do
    case "${line}" in
      ACTIVE_RENDER_JOBS_COUNT=[0-9]*)
        count="${line#ACTIVE_RENDER_JOBS_COUNT=}"
        ;;
    esac
  done <<< "${output}"
  if [[ "${code}" -eq 0 && "${count}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "${count}"
    return 0
  fi
  return 1
}

count_active_studio_render_jobs() {
  local count=""
  if count="$(count_active_studio_render_jobs_docker)"; then
    printf '%s\n' "${count}"
    return 0
  fi
  if count="$(count_active_studio_render_jobs_node "${CURRENT_LINK}")"; then
    printf '%s\n' "${count}"
    return 0
  fi
  return 1
}

run_safe_render_smoke() {
  local dir="${CURRENT_LINK}"
  local probe=""
  local output=""
  local code=0
  local line=""
  local result=""
  if [[ -n "${AUDIOLAD_STUDIO_RENDER_SMOKE_RESULT:-}" ]]; then
    printf '%s\n' "${AUDIOLAD_STUDIO_RENDER_SMOKE_RESULT}"
    return 0
  fi
  if [[ ! -d "${dir}" ]]; then
    return 1
  fi
  probe="$(mktemp)"
  cat >"${probe}" <<'JS'
const silent = { info() {}, error() {} };
const dir = process.argv[2];
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(dir, false, silent, true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("RENDER_SMOKE=FAIL");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const service = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const timer = setTimeout(() => {
  console.log("RENDER_SMOKE=FAIL");
  process.exit(2);
}, 20000);
service.rpc("recover_stale_studio_render_jobs")
  .then((recover) => {
    if (recover.error) {
      console.log("RENDER_SMOKE=FAIL");
      process.exit(2);
    }
    return service
      .from("studio_render_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "processing"]);
  })
  .then(({ count, error }) => {
    clearTimeout(timer);
    if (error || count !== 0) {
      console.log("RENDER_SMOKE=FAIL");
      process.exit(2);
    }
    console.log("RENDER_SMOKE=PASS");
  })
  .catch(() => {
    clearTimeout(timer);
    console.log("RENDER_SMOKE=FAIL");
    process.exit(2);
  });
JS
  set +e
  output="$(
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    export NODE_ENV=production
    export NODE_PATH="${dir}/node_modules${NODE_PATH:+:${NODE_PATH}}"
    cd "${dir}"
    node "${probe}" "${dir}" 2>/dev/null
  )"
  code=$?
  set -e
  rm -f "${probe}"
  output="$(printf '%s\n' "${output}" | redact_studio_stream)"
  while IFS= read -r line; do
    case "${line}" in
      RENDER_SMOKE=PASS|RENDER_SMOKE=FAIL)
        result="${line#RENDER_SMOKE=}"
        ;;
    esac
  done <<< "${output}"
  if [[ "${code}" -eq 0 && "${result}" == "PASS" ]]; then
    printf '%s\n' "PASS"
    return 0
  fi
  return 1
}

SAVED_OUT_LOG=""
SAVED_ERR_LOG=""
SAVED_OUT_OFFSET=0
SAVED_ERR_OFFSET=0

log_file_size() {
  local path="$1"
  if [[ -z "${path}" || ! -f "${path}" ]]; then
    printf '%s\n' "0"
    return 0
  fi
  stat -c '%s' "${path}" 2>/dev/null || printf '%s\n' "0"
}

save_log_offsets() {
  local fields="$1"
  SAVED_OUT_LOG="$(pm2_field "${fields}" "out_log")"
  SAVED_ERR_LOG="$(pm2_field "${fields}" "error_log")"
  SAVED_OUT_OFFSET="$(log_file_size "${SAVED_OUT_LOG}")"
  SAVED_ERR_OFFSET="$(log_file_size "${SAVED_ERR_LOG}")"
  echo "LOG OFFSETS saved out=${SAVED_OUT_LOG:-none}:${SAVED_OUT_OFFSET} err=${SAVED_ERR_LOG:-none}:${SAVED_ERR_OFFSET}"
}

read_appended_log() {
  local path="$1"
  local saved_path="$2"
  local saved_offset="$3"
  local size=0
  local offset=0
  if [[ -z "${path}" || ! -r "${path}" ]]; then
    return 0
  fi
  size="$(log_file_size "${path}")"
  if [[ "${path}" == "${saved_path}" ]]; then
    offset="${saved_offset:-0}"
    if (( size < offset )); then
      offset=0
    fi
  else
    offset=0
  fi
  if (( size <= offset )); then
    return 0
  fi
  tail -c "+$((offset + 1))" "${path}" 2>/dev/null || true
}

read_fresh_worker_logs() {
  local out_log="$1"
  local err_log="$2"
  local combined=""
  combined+="$(read_appended_log "${out_log}" "${SAVED_OUT_LOG}" "${SAVED_OUT_OFFSET}")"
  combined+=$'\n'
  combined+="$(read_appended_log "${err_log}" "${SAVED_ERR_LOG}" "${SAVED_ERR_OFFSET}")"
  combined+=$'\n'
  printf '%s\n' "${combined}" | filter_worker_log_lines | redact_studio_stream
}

fresh_logs_show_env_ready() {
  local logs="$1"
  if [[ "${logs}" != *studio_render_env_ready* ]]; then
    return 1
  fi
  if { [[ "${logs}" == *hasNextPublicSupabaseUrl=true* ]] || [[ "${logs}" == *'"hasNextPublicSupabaseUrl":true'* ]]; } \
    && { [[ "${logs}" == *hasSupabaseServiceRoleKey=true* ]] || [[ "${logs}" == *'"hasSupabaseServiceRoleKey":true'* ]]; }; then
    return 0
  fi
  return 1
}

fresh_logs_show_env_missing() {
  local logs="$1"
  [[ "${logs}" == *render_worker_environment_missing* || "${logs}" == *environment_missing* ]]
}

poll_fresh_env_ready() {
  local out_log="$1"
  local err_log="$2"
  local waited=0
  local logs=""
  echo "ENV BOOTSTRAP poll: waiting up to ${ENV_BOOTSTRAP_SECONDS}s for FRESH post-offset studio_render_env_ready"
  while (( waited < ENV_BOOTSTRAP_SECONDS )); do
    logs="$(read_fresh_worker_logs "${out_log}" "${err_log}")"
    if fresh_logs_show_env_missing "${logs}"; then
      printf '%s\n' "${logs}"
      echo "ENV BOOTSTRAP FAIL: environment_missing / render_worker_environment_missing in post-offset bytes"
      FRESH_ENV_READY_LOG="NO"
      return 1
    fi
    if fresh_logs_show_env_ready "${logs}"; then
      printf '%s\n' "${logs}"
      echo "ENV BOOTSTRAP: FRESH studio_render_env_ready after ${waited}s"
      FRESH_ENV_READY_LOG="YES"
      return 0
    fi
    sleep "${ENV_BOOTSTRAP_POLL_SECONDS}"
    waited=$((waited + ENV_BOOTSTRAP_POLL_SECONDS))
  done
  logs="$(read_fresh_worker_logs "${out_log}" "${err_log}")"
  printf '%s\n' "${logs}"
  echo "ENV BOOTSTRAP FAIL: no FRESH studio_render_env_ready in post-offset bytes within ${ENV_BOOTSTRAP_SECONDS}s"
  FRESH_ENV_READY_LOG="NO"
  return 1
}

wait_until_pm2_online() {
  local deadline=$((SECONDS + ONLINE_TIMEOUT_SECONDS))
  local fields=""
  local status=""
  while (( SECONDS < deadline )); do
    fields="$(read_pm2_recover_fields)"
    status="$(pm2_field "${fields}" "status")"
    if [[ "${status}" == "online" ]]; then
      printf '%s\n' "${fields}"
      return 0
    fi
    sleep "${POLL_SECONDS}"
  done
  fields="$(read_pm2_recover_fields)"
  printf '%s\n' "${fields}"
  return 1
}

poll_survival() {
  local start_restarts="$1"
  local start_pid="$2"
  local deadline=$((SECONDS + SURVIVE_SECONDS))
  local fields=""
  local status=""
  local now_restarts=""
  local now_pid=""
  while (( SECONDS < deadline )); do
    fields="$(read_pm2_recover_fields)"
    status="$(pm2_field "${fields}" "status")"
    now_restarts="$(pm2_field "${fields}" "restart_time")"
    now_pid="$(pm2_field "${fields}" "pid")"
    if [[ "${status}" != "online" ]]; then
      printf '%s\n' "${fields}"
      return 1
    fi
    if [[ "${now_restarts}" =~ ^[0-9]+$ && "${start_restarts}" =~ ^[0-9]+$ ]] \
      && (( now_restarts != start_restarts )); then
      printf '%s\n' "${fields}"
      return 1
    fi
    if [[ -n "${start_pid}" && -n "${now_pid}" && "${now_pid}" != "${start_pid}" ]]; then
      printf '%s\n' "${fields}"
      return 1
    fi
    sleep "${POLL_SECONDS}"
  done
  fields="$(read_pm2_recover_fields)"
  printf '%s\n' "${fields}"
  status="$(pm2_field "${fields}" "status")"
  now_restarts="$(pm2_field "${fields}" "restart_time")"
  now_pid="$(pm2_field "${fields}" "pid")"
  if [[ "${status}" != "online" ]]; then
    return 1
  fi
  if [[ "${now_restarts}" =~ ^[0-9]+$ && "${start_restarts}" =~ ^[0-9]+$ ]] \
    && (( now_restarts != start_restarts )); then
    return 1
  fi
  if [[ -n "${start_pid}" && -n "${now_pid}" && "${now_pid}" != "${start_pid}" ]]; then
    return 1
  fi
  return 0
}

run_studio_render_worker_recover() {
  local current_real=""
  local ecosystem=""
  local fields=""
  local status=""
  local start_restarts=""
  local start_pid=""
  local out_log=""
  local err_log=""
  local end_restarts=""
  local end_pid=""

  section "STUDIO_RENDER_WORKER_RECOVER"
  echo "mode=ops_studio_worker_recover"
  echo "audiolad_deploy=NOT_INVOKED"
  echo "CUTOVER=NO"
  echo "ssh_user=$(id -un)"
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
  if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" || -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    fail_recover "ssh session still exports worker secrets; refusing start"
    return 1
  fi

  section "STUDIO_RENDER_WORKER_CURRENT_RELEASE"
  if current_real="$(readlink -f "${CURRENT_LINK}")" && [[ -n "${current_real}" ]]; then
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=${current_real}"
    echo "CURRENT RELEASE=$(basename "${current_real}")"
  else
    fail_recover "current release symlink is unreadable"
    return 1
  fi

  section "STUDIO_RENDER_WORKER_ENV_METADATA"
  if ! ENV_FILE_OWNER_GROUP_MODE="$(stat -c '%U:%G %a' "${SHARED_ENV_PRODUCTION}")"; then
    ENV_FILE_OWNER_GROUP_MODE="STAT_FAILED"
    DEPLOY_CAN_READ_ENV="NO"
    fail_recover "stat failed for ${SHARED_ENV_PRODUCTION}"
    return 1
  fi
  printf 'ENV FILE OWNER/GROUP/MODE = %s\n' "${ENV_FILE_OWNER_GROUP_MODE}"
  if test -r "${SHARED_ENV_PRODUCTION}"; then
    DEPLOY_CAN_READ_ENV="YES"
  else
    DEPLOY_CAN_READ_ENV="NO"
  fi
  printf 'DEPLOY CAN READ ENV = %s\n' "${DEPLOY_CAN_READ_ENV}"
  ENV_PERMISSIONS="${ENV_FILE_OWNER_GROUP_MODE} READ=${DEPLOY_CAN_READ_ENV}"
  printf 'ENV PERMISSIONS = %s\n' "${ENV_PERMISSIONS}"
  if [[ "${DEPLOY_CAN_READ_ENV}" != "YES" ]]; then
    fail_recover "deploy cannot read shared .env.production; refusing restart"
    return 1
  fi

  section "STUDIO_RENDER_WORKER_ACTIVE_JOBS"
  if ! ACTIVE_RENDER_JOBS_BEFORE="$(count_active_studio_render_jobs)"; then
    ACTIVE_RENDER_JOBS_BEFORE="UNKNOWN"
    fail_recover "could not count queued/processing studio_render_jobs"
    return 1
  fi
  printf 'ACTIVE RENDER JOBS BEFORE=%s\n' "${ACTIVE_RENDER_JOBS_BEFORE}"
  if [[ "${ACTIVE_RENDER_JOBS_BEFORE}" != "0" ]]; then
    fail_recover "active render jobs != 0; refusing restart"
    return 1
  fi

  ecosystem="${CURRENT_LINK}/${ECOSYSTEM_REL}"
  section "STUDIO_RENDER_WORKER_ECOSYSTEM"
  echo "ecosystem=${ecosystem}"
  if [[ ! -f "${ecosystem}" ]]; then
    fail_recover "ecosystem file missing; expected ${ECOSYSTEM_REL} under current release"
    return 1
  fi

  section "STUDIO_RENDER_WORKER_CLEAN_START"
  fields="$(read_pm2_recover_fields)"
  save_log_offsets "${fields}"
  pm2 delete audiolad-studio-render-worker || true
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
  (
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    cd "${CURRENT_LINK}"
    pm2 start deploy/studio-render-worker.ecosystem.config.cjs
  )
  fields="$(read_pm2_recover_fields)"
  status="$(pm2_field "${fields}" "status")"
  if [[ "${status}" == "missing" || -z "${status}" ]]; then
    fail_recover "pm2 did not register ${PM2_APP_NAME} after start"
    return 1
  fi
  WORKER_CLEAN_START="YES"
  echo "WORKER CLEAN START = YES"

  section "STUDIO_RENDER_WORKER_WAIT_ONLINE"
  set +e
  fields="$(wait_until_pm2_online)"
  set -e
  status="$(pm2_field "${fields}" "status")"
  WORKER_RESTARTS="$(pm2_field "${fields}" "restart_time")"
  WORKER_PID="$(pm2_field "${fields}" "pid")"
  out_log="$(pm2_field "${fields}" "out_log")"
  err_log="$(pm2_field "${fields}" "error_log")"
  echo "status=${status}"
  echo "WORKER PID=${WORKER_PID}"
  echo "WORKER RESTARTS=${WORKER_RESTARTS}"
  if [[ "${status}" != "online" ]]; then
    fail_recover "worker did not reach PM2 status=online"
    return 1
  fi

  section "STUDIO_RENDER_WORKER_ENV_BOOTSTRAP"
  echo "out_log_path=${out_log:-unknown}"
  echo "error_log_path=${err_log:-unknown}"
  echo "saved_out_offset=${SAVED_OUT_OFFSET}"
  echo "saved_err_offset=${SAVED_ERR_OFFSET}"
  set +e
  poll_fresh_env_ready "${out_log}" "${err_log}"
  set -e
  echo "FRESH ENV READY LOG = ${FRESH_ENV_READY_LOG}"
  if [[ "${FRESH_ENV_READY_LOG}" != "YES" ]]; then
    fail_recover "no FRESH post-offset studio_render_env_ready with both env booleans true"
    return 1
  fi

  fields="$(read_pm2_recover_fields)"
  status="$(pm2_field "${fields}" "status")"
  WORKER_RESTARTS="$(pm2_field "${fields}" "restart_time")"
  WORKER_PID="$(pm2_field "${fields}" "pid")"
  echo "status=${status}"
  echo "WORKER PID=${WORKER_PID}"
  echo "WORKER RESTARTS=${WORKER_RESTARTS}"
  if [[ "${status}" != "online" ]]; then
    fail_recover "worker left PM2 status=online before survival window"
    return 1
  fi

  section "STUDIO_RENDER_WORKER_SURVIVAL"
  start_restarts="${WORKER_RESTARTS}"
  start_pid="${WORKER_PID}"
  set +e
  fields="$(poll_survival "${start_restarts}" "${start_pid}")"
  set -e
  status="$(pm2_field "${fields}" "status")"
  end_restarts="$(pm2_field "${fields}" "restart_time")"
  end_pid="$(pm2_field "${fields}" "pid")"
  WORKER_RESTARTS="${end_restarts}"
  WORKER_PID="${end_pid}"
  echo "status=${status}"
  echo "WORKER PID=${WORKER_PID}"
  echo "WORKER RESTARTS=${WORKER_RESTARTS}"
  if [[ "${end_restarts}" =~ ^[0-9]+$ && "${start_restarts}" =~ ^[0-9]+$ ]] \
    && (( end_restarts == start_restarts )); then
    RESTART_COUNT_STABLE="YES"
  else
    RESTART_COUNT_STABLE="NO"
  fi
  echo "RESTART COUNT STABLE = ${RESTART_COUNT_STABLE}"
  if [[ "${status}" == "online" ]] \
    && [[ "${RESTART_COUNT_STABLE}" == "YES" ]] \
    && [[ -n "${start_pid}" && "${end_pid}" == "${start_pid}" ]]; then
    SURVIVED_OVER_2_5_MIN="YES"
  else
    SURVIVED_OVER_2_5_MIN="NO"
    fail_recover "worker did not survive ${SURVIVE_SECONDS}s with stable pid/status/restart count"
    return 1
  fi
  echo "SURVIVED >2.5 MIN = YES"

  section "STUDIO_RENDER_WORKER_SMOKE"
  set +e
  RENDER_SMOKE="$(run_safe_render_smoke)"
  set -e
  if [[ "${RENDER_SMOKE}" != "PASS" ]]; then
    RENDER_SMOKE="FAIL"
  fi
  echo "RENDER SMOKE = ${RENDER_SMOKE}"
  if [[ "${RENDER_SMOKE}" != "PASS" ]]; then
    fail_recover "safe render smoke did not PASS"
    return 1
  fi

  if [[ "${WORKER_CLEAN_START}" == "YES" && "${FRESH_ENV_READY_LOG}" == "YES" && "${RESTART_COUNT_STABLE}" == "YES" && "${SURVIVED_OVER_2_5_MIN}" == "YES" && "${RENDER_SMOKE}" == "PASS" ]]; then
    ACCEPTANCE="SUCCESS"
    pm2 save
  fi

  section "STUDIO_RENDER_WORKER_RECOVER_END"
  print_final_flags
  if [[ "${ACCEPTANCE}" != "SUCCESS" ]]; then
    return 1
  fi
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_studio_render_worker_recover
fi
