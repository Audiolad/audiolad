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
SURVIVE_SECONDS="${AUDIOLAD_STUDIO_WORKER_SURVIVE_SECONDS:-151}"
ONLINE_TIMEOUT_SECONDS="${AUDIOLAD_STUDIO_WORKER_ONLINE_TIMEOUT_SECONDS:-60}"
POLL_SECONDS="${AUDIOLAD_STUDIO_WORKER_POLL_SECONDS:-5}"
DB_CONTAINER="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"

ENV_FILE_OWNER_GROUP_MODE=""
DEPLOY_CAN_READ_ENV="NO"
ACTIVE_RENDER_JOBS_BEFORE="UNKNOWN"
WORKER_CLEAN_START="NO"
ENV_BOOTSTRAP="NO"
WORKER_RESTARTS="UNKNOWN"
SURVIVED_OVER_2_5_MIN="NO"
RENDER_SMOKE="SKIPPED_NO_SAFE_HOOK"
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
  printf '%s\n' "ENV FILE OWNER/GROUP/MODE = ${ENV_FILE_OWNER_GROUP_MODE}"
  printf '%s\n' "DEPLOY CAN READ ENV = ${DEPLOY_CAN_READ_ENV}"
  printf '%s\n' "ACTIVE RENDER JOBS BEFORE = ${ACTIVE_RENDER_JOBS_BEFORE}"
  printf '%s\n' "WORKER CLEAN START = ${WORKER_CLEAN_START}"
  printf '%s\n' "ENV BOOTSTRAP = ${ENV_BOOTSTRAP}"
  printf '%s\n' "WORKER RESTARTS = ${WORKER_RESTARTS}"
  printf '%s\n' "SURVIVED >2.5 MIN = ${SURVIVED_OVER_2_5_MIN}"
  printf '%s\n' "RENDER SMOKE = ${RENDER_SMOKE}"
  printf '%s\n' "#353 PRODUCTION ACCEPTANCE = ${ACCEPTANCE}"
  printf '%s\n' "CUTOVER = ${CUTOVER}"
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
    print("out_log=")
    print("error_log=")
    raise SystemExit(0)
if not isinstance(procs, list):
    print("status=missing")
    print("restart_time=")
    print("out_log=")
    print("error_log=")
    raise SystemExit(0)
for proc in procs:
    if not isinstance(proc, dict) or proc.get("name") != name:
        continue
    env = proc.get("pm2_env") if isinstance(proc.get("pm2_env"), dict) else {}
    print("status=%s" % env.get("status", ""))
    print("restart_time=%s" % env.get("restart_time", ""))
    print("out_log=%s" % env.get("pm_out_log_path", ""))
    print("error_log=%s" % env.get("pm_err_log_path", ""))
    raise SystemExit(0)
print("status=missing")
print("restart_time=")
print("out_log=")
print("error_log=")
'
}

read_pm2_recover_fields() {
  local raw=""
  if ! command -v pm2 >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' "status=missing"
    printf '%s\n' "restart_time="
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

logs_show_env_ready() {
  local out_log="$1"
  local err_log="$2"
  local combined=""
  if [[ -n "${out_log}" && -r "${out_log}" ]]; then
    combined+="$(tail -n 200 "${out_log}")"
    combined+=$'\n'
  fi
  if [[ -n "${err_log}" && -r "${err_log}" ]]; then
    combined+="$(tail -n 200 "${err_log}")"
    combined+=$'\n'
  fi
  combined="$(printf '%s\n' "${combined}" | filter_worker_log_lines | redact_studio_stream)"
  printf '%s\n' "${combined}"
  if [[ "${combined}" == *studio_render_env_ready* ]] \
    && [[ "${combined}" == *hasNextPublicSupabaseUrl*true* ]] \
    && [[ "${combined}" == *hasSupabaseServiceRoleKey*true* ]]; then
    return 0
  fi
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
  local deadline=$((SECONDS + SURVIVE_SECONDS))
  local fields=""
  local status=""
  local now_restarts=""
  while (( SECONDS < deadline )); do
    fields="$(read_pm2_recover_fields)"
    status="$(pm2_field "${fields}" "status")"
    now_restarts="$(pm2_field "${fields}" "restart_time")"
    if [[ "${status}" != "online" ]]; then
      printf '%s\n' "${fields}"
      return 1
    fi
    if [[ "${now_restarts}" =~ ^[0-9]+$ && "${start_restarts}" =~ ^[0-9]+$ ]] \
      && (( now_restarts > start_restarts )); then
      printf '%s\n' "${fields}"
      return 1
    fi
    sleep "${POLL_SECONDS}"
  done
  fields="$(read_pm2_recover_fields)"
  printf '%s\n' "${fields}"
  status="$(pm2_field "${fields}" "status")"
  now_restarts="$(pm2_field "${fields}" "restart_time")"
  if [[ "${status}" != "online" ]]; then
    return 1
  fi
  if [[ "${now_restarts}" =~ ^[0-9]+$ && "${start_restarts}" =~ ^[0-9]+$ ]] \
    && (( now_restarts > start_restarts )); then
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
  local out_log=""
  local err_log=""
  local filtered=""

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
  if [[ ! "${ACTIVE_RENDER_JOBS_BEFORE}" =~ ^[0-9]+$ ]]; then
    fail_recover "active render job count is not a number"
    return 1
  fi
  if (( ACTIVE_RENDER_JOBS_BEFORE > 0 )); then
    fail_recover "active render jobs > 0; refusing restart"
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
  status="$(pm2_field "${fields}" "status")"
  if [[ "${status}" != "missing" && -n "${status}" ]]; then
    pm2 delete "${PM2_APP_NAME}"
  fi
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
  (
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    cd "${CURRENT_LINK}"
    pm2 start "${ECOSYSTEM_REL}"
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
  out_log="$(pm2_field "${fields}" "out_log")"
  err_log="$(pm2_field "${fields}" "error_log")"
  echo "status=${status}"
  echo "WORKER RESTARTS=${WORKER_RESTARTS}"
  if [[ "${status}" != "online" ]]; then
    fail_recover "worker did not reach PM2 status=online"
    return 1
  fi

  section "STUDIO_RENDER_WORKER_ENV_BOOTSTRAP"
  echo "out_log_path=${out_log:-unknown}"
  echo "error_log_path=${err_log:-unknown}"
  set +e
  filtered="$(logs_show_env_ready "${out_log}" "${err_log}")"
  set -e
  printf '%s\n' "${filtered}"
  if [[ "${filtered}" == *studio_render_env_ready* ]] \
    && [[ "${filtered}" == *hasNextPublicSupabaseUrl*true* ]] \
    && [[ "${filtered}" == *hasSupabaseServiceRoleKey*true* ]]; then
    ENV_BOOTSTRAP="YES"
  else
    ENV_BOOTSTRAP="NO"
    fail_recover "worker logs missing studio_render_env_ready with both env booleans true"
    return 1
  fi
  echo "ENV BOOTSTRAP = YES"

  section "STUDIO_RENDER_WORKER_SURVIVAL"
  start_restarts="${WORKER_RESTARTS}"
  set +e
  fields="$(poll_survival "${start_restarts}")"
  set -e
  status="$(pm2_field "${fields}" "status")"
  WORKER_RESTARTS="$(pm2_field "${fields}" "restart_time")"
  echo "status=${status}"
  echo "WORKER RESTARTS=${WORKER_RESTARTS}"
  if [[ "${status}" == "online" ]] \
    && [[ "${WORKER_RESTARTS}" =~ ^[0-9]+$ ]] \
    && [[ "${start_restarts}" =~ ^[0-9]+$ ]] \
    && (( WORKER_RESTARTS <= start_restarts )); then
    SURVIVED_OVER_2_5_MIN="YES"
  else
    SURVIVED_OVER_2_5_MIN="NO"
    fail_recover "worker did not survive ${SURVIVE_SECONDS}s without restart_time increase"
    return 1
  fi
  echo "SURVIVED >2.5 MIN = YES"

  section "STUDIO_RENDER_WORKER_SMOKE"
  echo "RENDER SMOKE = ${RENDER_SMOKE}"

  if [[ "${WORKER_CLEAN_START}" == "YES" && "${ENV_BOOTSTRAP}" == "YES" && "${SURVIVED_OVER_2_5_MIN}" == "YES" ]]; then
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
