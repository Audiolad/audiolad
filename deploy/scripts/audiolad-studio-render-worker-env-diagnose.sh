#!/usr/bin/env bash
# Read-only Studio render-worker env diagnostics for operators / GHA DO_NOT_DEPLOY.
# Never prints env file contents or secret values. Never invokes audiolad-deploy,
# never starts/restarts PM2, never writes production state.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
SHARED_ENV_PRODUCTION="${DEPLOY_ROOT}/shared/.env.production"
PM2_APP_NAME="audiolad-studio-render-worker"

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

if ! declare -F try_cmd >/dev/null 2>&1; then
  try_cmd() {
    local label="$1"
    shift
    section "${label}"
    if "$@" 2>&1 | redact_stream; then
      return 0
    fi
    local code=$?
    printf 'BLOCKED exit=%s label=%s\n' "${code}" "${label}"
    return 0
  }
fi

can_read_flag() {
  local name="$1"
  local path="$2"
  if test -r "${path}"; then
    printf 'DEPLOY_CAN_READ_%s=YES\n' "${name}"
  else
    printf 'DEPLOY_CAN_READ_%s=NO\n' "${name}"
  fi
}

diagnose_env_path() {
  local label="$1"
  local path="$2"
  local real=""
  section "STUDIO_RENDER_WORKER_ENV_${label}"
  echo "path=${path}"
  if [[ -L "${path}" ]]; then
    echo "exists=YES"
    echo "symlink=YES"
    echo "symlink_target=$(readlink "${path}")"
    if real="$(readlink -f "${path}")" && [[ -n "${real}" && -e "${real}" ]]; then
      echo "realpath=${real}"
    else
      echo "realpath=BROKEN"
    fi
  elif [[ -e "${path}" ]]; then
    echo "exists=YES"
    echo "symlink=NO"
    if real="$(readlink -f "${path}")" && [[ -n "${real}" ]]; then
      echo "realpath=${real}"
    else
      echo "realpath=BROKEN"
    fi
  else
    echo "exists=NO"
    echo "symlink=NO"
    echo "realpath=BROKEN"
  fi

  if [[ -e "${path}" || -L "${path}" ]]; then
    if STAT="$(stat -c 'stat_owner=%U stat_group=%G stat_mode=%a' "${path}")"; then
      printf '%s\n' "${STAT}"
    else
      echo "stat_failed"
    fi
  fi
  if [[ -n "${real}" && -e "${real}" ]]; then
    if TARGET_STAT="$(stat -c 'target_stat_owner=%U target_stat_group=%G target_stat_mode=%a' "${real}")"; then
      printf '%s\n' "${TARGET_STAT}"
    else
      echo "target_stat_failed"
    fi
  fi
}

print_pm2_safe_fields() {
  python3 -c '
import json, sys
name = "audiolad-studio-render-worker"
try:
    procs = json.load(sys.stdin)
except Exception:
    print("pm2_jlist_unreadable")
    raise SystemExit(0)
if not isinstance(procs, list):
    print("pm2_jlist_unreadable")
    raise SystemExit(0)
found = False
for proc in procs:
    if not isinstance(proc, dict) or proc.get("name") != name:
        continue
    found = True
    env = proc.get("pm2_env") if isinstance(proc.get("pm2_env"), dict) else {}
    cron = env.get("cron_restart")
    print("name=%s" % name)
    print("status=%s" % env.get("status", ""))
    print("restarts=%s" % env.get("restart_time", ""))
    print("unstable_restarts=%s" % env.get("unstable_restarts", ""))
    print("cron_restart=%s" % ("none" if cron in (None, "") else cron))
    print("autorestart=%s" % env.get("autorestart", ""))
    print("cwd=%s" % env.get("pm_cwd", ""))
    print("out_log=%s" % env.get("pm_out_log_path", ""))
    print("error_log=%s" % env.get("pm_err_log_path", ""))
if not found:
    print("pm2_process_not_found name=%s" % name)
'
}

filter_worker_log_lines() {
  awk '/studio_render_env_ready|environment_missing|hasNextPublic|hasSupabase|redacted/'
}

run_loadenv_probe() {
  local label="$1"
  local dir="$2"
  local probe=""
  local output=""
  local code=0
  section "STUDIO_RENDER_WORKER_LOADENV_${label}"
  echo "dir=${dir}"
  if [[ ! -d "${dir}" ]]; then
    echo "dir_missing"
    echo "HAS_NEXT_PUBLIC_SUPABASE_URL=false"
    echo "HAS_SUPABASE_SERVICE_ROLE_KEY=false"
    return 0
  fi

  probe="$(mktemp)"
  cat >"${probe}" <<'JS'
const silent = { info() {}, error() {} };
const dir = process.argv[2];
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(dir, false, silent, true);
const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("HAS_NEXT_PUBLIC_SUPABASE_URL=" + hasUrl);
console.log("HAS_SUPABASE_SERVICE_ROLE_KEY=" + hasKey);
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
  if [[ "${code}" -ne 0 ]]; then
    echo "loadenv_probe_failed exit=${code}"
    echo "HAS_NEXT_PUBLIC_SUPABASE_URL=false"
    echo "HAS_SUPABASE_SERVICE_ROLE_KEY=false"
    return 0
  fi
  local printed_url=0
  local printed_key=0
  local line=""
  while IFS= read -r line; do
    case "${line}" in
      HAS_NEXT_PUBLIC_SUPABASE_URL=true|HAS_NEXT_PUBLIC_SUPABASE_URL=false)
        printf '%s\n' "${line}"
        printed_url=1
        ;;
      HAS_SUPABASE_SERVICE_ROLE_KEY=true|HAS_SUPABASE_SERVICE_ROLE_KEY=false)
        printf '%s\n' "${line}"
        printed_key=1
        ;;
    esac
  done <<< "${output}"
  if [[ "${printed_url}" -eq 0 ]]; then
    echo "HAS_NEXT_PUBLIC_SUPABASE_URL=false"
  fi
  if [[ "${printed_key}" -eq 0 ]]; then
    echo "HAS_SUPABASE_SERVICE_ROLE_KEY=false"
  fi
}

run_studio_render_worker_env_diagnose() {
  local current_real=""
  local current_env_production="${CURRENT_LINK}/.env.production"
  local current_env_local="${CURRENT_LINK}/.env.local"
  local pm2_safe=""
  local out_log=""
  local err_log=""
  local probe_realpath=""

  section "STUDIO_RENDER_WORKER_ENV_DIAGNOSTIC"
  echo "mode=read_only"
  echo "audiolad_deploy=NOT_INVOKED"
  echo "ssh_user=$(id -un)"

  section "STUDIO_RENDER_WORKER_CURRENT_RELEASE"
  if current_real="$(readlink -f "${CURRENT_LINK}")" && [[ -n "${current_real}" ]]; then
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=${current_real}"
    echo "CURRENT RELEASE=$(basename "${current_real}")"
  else
    current_real=""
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=BROKEN"
    echo "CURRENT RELEASE=UNKNOWN"
  fi

  diagnose_env_path "CURRENT_ENV_PRODUCTION" "${current_env_production}"
  diagnose_env_path "CURRENT_ENV_LOCAL" "${current_env_local}"
  diagnose_env_path "SHARED_ENV_PRODUCTION" "${SHARED_ENV_PRODUCTION}"

  try_cmd "STUDIO_RENDER_WORKER_NAMEI_CURRENT_ENV_PRODUCTION" namei -l "${current_env_production}"
  try_cmd "STUDIO_RENDER_WORKER_NAMEI_CURRENT_ENV_LOCAL" namei -l "${current_env_local}"
  try_cmd "STUDIO_RENDER_WORKER_NAMEI_SHARED_ENV_PRODUCTION" namei -l "${SHARED_ENV_PRODUCTION}"

  section "STUDIO_RENDER_WORKER_DEPLOY_CAN_READ"
  can_read_flag "CURRENT_ENV_PRODUCTION" "${current_env_production}"
  can_read_flag "CURRENT_ENV_LOCAL" "${current_env_local}"
  can_read_flag "SHARED_ENV_PRODUCTION" "${SHARED_ENV_PRODUCTION}"

  section "STUDIO_RENDER_WORKER_PM2"
  if command -v pm2 >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    set +e
    pm2_safe="$(pm2 jlist 2>/dev/null | print_pm2_safe_fields)"
    set -e
    if [[ -n "${pm2_safe}" ]]; then
      printf '%s\n' "${pm2_safe}" | redact_studio_stream
    else
      echo "pm2_jlist_failed"
    fi
  else
    echo "pm2_or_python3_not_found"
  fi

  if command -v pm2 >/dev/null 2>&1; then
    try_cmd "STUDIO_RENDER_WORKER_PM2_STATUS" pm2 status "${PM2_APP_NAME}"
  fi

  section "STUDIO_RENDER_WORKER_PM2_DESCRIBE"
  if command -v pm2 >/dev/null 2>&1; then
    set +e
    pm2 describe "${PM2_APP_NAME}" 2>&1 \
      | awk '/Divergent env variables/{exit} {print}' \
      | redact_studio_stream
    set -e
  else
    echo "pm2_not_found"
  fi

  section "STUDIO_RENDER_WORKER_PM2_LOGS"
  out_log="$(printf '%s\n' "${pm2_safe}" | awk -F= '/^out_log=/{print substr($0, index($0,"=")+1)}')"
  err_log="$(printf '%s\n' "${pm2_safe}" | awk -F= '/^error_log=/{print substr($0, index($0,"=")+1)}')"
  echo "out_log_path=${out_log:-unknown}"
  echo "error_log_path=${err_log:-unknown}"
  if [[ -n "${out_log}" && -r "${out_log}" ]]; then
    echo "out_log_filtered<<"
    tail -n 200 "${out_log}" | filter_worker_log_lines | redact_studio_stream
    echo ">>out_log_filtered"
  else
    echo "out_log_unreadable"
  fi
  if [[ -n "${err_log}" && -r "${err_log}" ]]; then
    echo "error_log_filtered<<"
    tail -n 200 "${err_log}" | filter_worker_log_lines | redact_studio_stream
    echo ">>error_log_filtered"
  else
    echo "error_log_unreadable"
  fi

  probe_realpath="${current_real}"
  run_loadenv_probe "CWD" "${CURRENT_LINK}"
  if [[ -n "${probe_realpath}" ]]; then
    run_loadenv_probe "REALPATH" "${probe_realpath}"
  else
    section "STUDIO_RENDER_WORKER_LOADENV_REALPATH"
    echo "dir=BROKEN"
    echo "HAS_NEXT_PUBLIC_SUPABASE_URL=false"
    echo "HAS_SUPABASE_SERVICE_ROLE_KEY=false"
  fi

  try_cmd "STUDIO_RENDER_WORKER_SUDO_N_L" sudo -n -l
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_studio_render_worker_env_diagnose
fi
