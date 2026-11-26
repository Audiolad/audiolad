#!/usr/bin/env bash
# Read-only preflight for music-storage bulk copy (GHA trusted helper). No deletes/cutover.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
CTL="/usr/local/lib/audiolad/audiolad-music-storage-bulk-ctl.sh"
ENV_COPY="/etc/audiolad/music-storage-bulk-copy.env"

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

printf '%s\n' "confirm=OPS_MUSIC_STORAGE_BULK_DIAG"
printf '%s\n' "mode=read_only"

section "DISK"
df -P -h / /var/www 2>/dev/null | redact_stream || df -P -h / | redact_stream

section "COPY_ENV"
if [[ -f "$ENV_COPY" ]]; then
  printf '%s\n' "copy_env_present=true"
  if grep -q '^AUDIOLAD_MUSIC_STORAGE_BULK=1' "$ENV_COPY" 2>/dev/null; then
    printf '%s\n' "audiolad_music_storage_bulk=enabled"
  elif grep -q '^AUDIOLAD_MUSIC_STORAGE_BULK=' "$ENV_COPY" 2>/dev/null; then
    printf '%s\n' "audiolad_music_storage_bulk=set_not_1"
  else
    printf '%s\n' "audiolad_music_storage_bulk=absent"
  fi
  grep -E '^AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_(STATE|BATCH_SIZE|CONCURRENCY)=' "$ENV_COPY" \
    | sed -E 's/=.*$/=<set>/' || true
else
  printf '%s\n' "copy_env_present=false"
  printf '%s\n' "audiolad_music_storage_bulk=absent"
fi

section "SYSTEMD_COPY_TIMER"
for u in audiolad-music-storage-bulk-copy.timer audiolad-music-storage-bulk-copy.service; do
  if [[ -f "/etc/systemd/system/${u}" ]]; then
    printf '%s\n' "unit_present_${u}=true"
  else
    printf '%s\n' "unit_present_${u}=false"
  fi
done
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-enabled audiolad-music-storage-bulk-copy.timer 2>&1 | sed 's/^/timer_enabled=/' || true
  systemctl is-active audiolad-music-storage-bulk-copy.timer 2>&1 | sed 's/^/timer_active=/' || true
  systemctl show audiolad-music-storage-bulk-copy.timer -p NextElapseUSecRealtime --value 2>/dev/null \
    | sed 's/^/timer_next=/' || true
fi

section "ORCHESTRATOR_CTL_STATUS"
if [[ -x "$CTL" ]]; then
  "$CTL" status copy 2>&1 | redact_stream || true
else
  printf '%s\n' '{"error":"ctl_not_installed"}'
fi

section "START_COPY_READINESS"
ENABLE_LIB="/usr/local/lib/audiolad/audiolad-music-storage-bulk-enable-copy-env.sh"
if [[ -x "$ENABLE_LIB" ]]; then
  printf '%s\n' "enable_copy_env_helper=present"
else
  printf '%s\n' "enable_copy_env_helper=missing"
  printf '%s\n' "hint=OPS_MUSIC_STORAGE_BULK_INSTALL_after_merge_or_redeploy"
fi
if [[ -x "$CTL" ]] \
  && [[ -f /etc/systemd/system/audiolad-music-storage-bulk-copy.timer ]]; then
  printf '%s\n' "start_copy_ops_ready=units_and_ctl"
else
  printf '%s\n' "start_copy_ops_ready=false"
fi

if [[ ! -L "$CURRENT_LINK" ]]; then
  printf '%s\n' '{"error":"current_release_missing"}' >&2
  exit 1
fi

CURRENT_DIR="$(readlink -f "$CURRENT_LINK")"
cd "$CURRENT_DIR"
export NODE_ENV=production
export NODE_OPTIONS="${NODE_OPTIONS:---require ./scripts/cjs-stub-server-only.cjs}"

section "MUSIC_STORAGE_REPORT"
if ! npm run music-storage:report 2>&1 | redact_stream; then
  printf '%s\n' "music_storage_report_failed=true"
fi

section "BULK_COPY_PREFLIGHT_S3_QUOTA_FULL_REMAINING"
# Full pendingBytes quota + S3 HEAD probe (not limited to batch 25).
if ! npm run music-storage:preflight 2>&1 | redact_stream; then
  printf '%s\n' "bulk_copy_preflight_failed=true"
fi

section "BULK_COPY_DRY_RUN_BATCH_25"
if ! npm run music-storage:bulk -- --stage copy --batch-size 25 --concurrency 1 2>&1 | redact_stream; then
  printf '%s\n' "bulk_copy_dry_run_failed=true"
fi

section "DIAG_END"
printf '%s\n' "OPS_MUSIC_STORAGE_BULK_DIAG_END=ok"