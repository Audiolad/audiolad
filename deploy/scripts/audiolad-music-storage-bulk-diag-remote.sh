#!/usr/bin/env bash
# Read-only preflight for music-storage bulk copy (GHA trusted helper). No deletes/cutover.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
CTL="/usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh"
DIAG_SBIN="/usr/local/sbin/audiolad-music-storage-bulk-ops-diag"
DIAG_FAILED=0

section() {
  printf '\n===%s===\n' "$1"
}

redact_stream() {
  sed -E \
    -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
    -e 's/(TIMEWEB_S3_[A-Z_]+=).*/\1***/g' \
    -e 's/(TIMEWEB_[A-Z0-9_]+=).*/\1***/g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted-jwt]/g'
}

mark_section_fail() {
  local name="$1"
  printf '%s\n' "DIAG_SECTION_FAILED=${name}"
  DIAG_FAILED=1
}

mark_section_ok() {
  local name="$1"
  printf '%s\n' "DIAG_SECTION_OK=${name}"
}

sudo_stderr_is_denial() {
  local err_file="$1"
  grep -qiE 'a password is required|not allowed to execute|sorry, user .+ is not allowed' "$err_file"
}

invoke_privileged_diag() {
  local err
  err="$(mktemp)"
  trap "rm -f '$err'" RETURN
  if [[ -x "$DIAG_SBIN" ]] && sudo -n "$DIAG_SBIN" 2>"$err" | redact_stream; then
    return 0
  fi
  if sudo_stderr_is_denial "$err"; then
    printf '%s\n' '{"error":"privileged_diag_sudo_denied"}' >&2
  else
    cat "$err" >&2
  fi
  return 1
}

finish_diag() {
  if (( DIAG_FAILED )); then
    printf '%s\n' "OPS_MUSIC_STORAGE_BULK_DIAG_END=incomplete"
    exit 1
  fi
  printf '%s\n' "OPS_MUSIC_STORAGE_BULK_DIAG_END=ok"
}

trap 'finish_diag' EXIT

printf '%s\n' "confirm=OPS_MUSIC_STORAGE_BULK_DIAG"
printf '%s\n' "mode=read_only"

section "DISK"
if ! df -P -h / /var/www 2>/dev/null | redact_stream; then
  df -P -h / | redact_stream || mark_section_fail "disk"
fi
mark_section_ok "disk"

section "COPY_ENV"
if [[ -e "/etc/audiolad/music-storage-bulk-copy.env" ]]; then
  printf '%s\n' "copy_env_present=true"
  if [[ -r "/etc/audiolad/music-storage-bulk-copy.env" ]]; then
    printf '%s\n' "copy_env_deploy_readable=true"
  else
    printf '%s\n' "copy_env_deploy_readable=false"
    printf '%s\n' "hint=privileged_diag_required"
  fi
else
  printf '%s\n' "copy_env_present=false"
fi

section "PRIVILEGED_DIAG"
if invoke_privileged_diag; then
  mark_section_ok "privileged_diag"
else
  mark_section_fail "privileged_diag"
fi

section "ORCHESTRATOR_CTL_STATUS"
set +e
if [[ -x "$CTL" ]]; then
  if "$CTL" status copy 2>&1 | redact_stream; then
    mark_section_ok "orchestrator_ctl"
  else
    mark_section_fail "orchestrator_ctl"
  fi
else
  printf '%s\n' '{"error":"ctl_not_installed"}'
  mark_section_fail "orchestrator_ctl"
fi
set -e

section "START_COPY_READINESS"
ENABLE_LIB="/usr/local/lib/audiolad/audiolad-music-storage-bulk-enable-copy-env.sh"
if [[ -x "$ENABLE_LIB" ]]; then
  printf '%s\n' "enable_copy_env_helper=present"
else
  printf '%s\n' "enable_copy_env_helper=missing"
  printf '%s\n' "hint=OPS_MUSIC_STORAGE_BULK_INSTALL_after_merge_or_redeploy"
fi
if [[ -x "$DIAG_SBIN" ]] \
  && [[ -x "$CTL" ]] \
  && [[ -f /etc/systemd/system/audiolad-music-storage-bulk-copy.timer ]]; then
  printf '%s\n' "start_copy_ops_ready=units_and_ctl"
else
  printf '%s\n' "start_copy_ops_ready=false"
fi

if [[ ! -L "$CURRENT_LINK" ]]; then
  mark_section_fail "current_release"
  exit 1
fi

CURRENT_DIR="$(readlink -f "$CURRENT_LINK")"
cd "$CURRENT_DIR"
export NODE_ENV=production
export NODE_OPTIONS="${NODE_OPTIONS:---require ./scripts/cjs-stub-server-only.cjs}"

section "MUSIC_STORAGE_REPORT"
set +e
if npm run music-storage:report 2>&1 | redact_stream; then
  mark_section_ok "music_storage_report"
else
  printf '%s\n' "music_storage_report_failed=true"
  mark_section_fail "music_storage_report"
fi

section "BULK_COPY_PREFLIGHT_S3_QUOTA_FULL_REMAINING"
if npm run music-storage:preflight 2>&1 | redact_stream; then
  mark_section_ok "bulk_copy_preflight"
else
  printf '%s\n' "bulk_copy_preflight_failed=true"
  mark_section_fail "bulk_copy_preflight"
fi

section "BULK_COPY_DRY_RUN_BATCH_25"
if npm run music-storage:bulk -- --stage copy --batch-size 25 --concurrency 1 2>&1 | redact_stream; then
  mark_section_ok "bulk_copy_dry_run"
else
  printf '%s\n' "bulk_copy_dry_run_failed=true"
  mark_section_fail "bulk_copy_dry_run"
fi
set -e