#!/usr/bin/env bash
# Root-only read-only fragments for OPS_MUSIC_STORAGE_BULK_DIAG (no env secrets).
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

ENV_COPY="${AUDIOLAD_MUSIC_STORAGE_BULK_COPY_ENV:-/etc/audiolad/music-storage-bulk-copy.env}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"

section() {
  printf '\n===%s===\n' "$1"
}

section "PRIV_COPY_ENV"
if [[ -f "$ENV_COPY" ]]; then
  printf '%s\n' "copy_env_present=true"
  printf '%s\n' "copy_env_readable_root=true"
  stat -c 'copy_env_mode=%a' "$ENV_COPY" 2>/dev/null || true
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  case "$line" in
    AUDIOLAD_MUSIC_STORAGE_BULK=*)
      printf '%s\n' "${line%%=*}=${line#*=}"
      ;;
    AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_*=*)
      printf '%s\n' "${line%%=*}=<set>"
      ;;
    *SUPABASE_*|*SECRET*|*PASSWORD*|*TOKEN*|*TIMEWEB_S3_*KEY*|*SERVICE_ROLE*)
      ;;
    *) ;;
  esac
  done <"$ENV_COPY"
else
  printf '%s\n' "copy_env_present=false"
fi

section "PRIV_SYSTEMD_COPY_TIMER"
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
  systemctl show audiolad-music-storage-bulk-copy.timer \
    -p UnitFileState,ActiveState,NextElapseUSecRealtime --value 2>/dev/null \
    | sed 's/^/timer_show=/' || true
fi

section "PRIV_DEPLOY_RELEASES_SUMMARY"
df -P -h / /var/www "${DEPLOY_ROOT}" 2>/dev/null | head -20 || df -P -h / | head -5
if [[ -L "${DEPLOY_ROOT}/current" ]]; then
  printf '%s\n' "current=$(readlink -f "${DEPLOY_ROOT}/current" 2>/dev/null || echo missing)"
fi
if [[ -L "${DEPLOY_ROOT}/previous" ]]; then
  printf '%s\n' "previous=$(readlink -f "${DEPLOY_ROOT}/previous" 2>/dev/null || echo missing)"
fi
if [[ -d "${DEPLOY_ROOT}/releases" ]]; then
  release_count="$(find "${DEPLOY_ROOT}/releases" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) 2>/dev/null | wc -l | tr -d ' ')"
  printf '%s\n' "releases_count=${release_count}"
  du -sh "${DEPLOY_ROOT}/releases" 2>/dev/null | sed 's/^/releases_total=/' || true
  du -sh "${DEPLOY_ROOT}/releases"/* 2>/dev/null | sort -hr | head -25 | sed 's/^/release_size=/' || true
fi

printf '%s\n' "OPS_MUSIC_STORAGE_BULK_PRIV_DIAG_END=ok"