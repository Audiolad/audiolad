#!/usr/bin/env bash
# Read-only: verify GHA OPS chain permissions without mutations.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
fail=0

mark_fail() { printf '%s\n' "preflight_fail=$1"; fail=$((fail + 1)); }
mark_ok() { printf '%s\n' "preflight_ok=$1"; }

printf '%s\n' "confirm=OPS_MUSIC_STORAGE_BULK_OPS_PREFLIGHT"

if [[ -w "${DEPLOY_ROOT}/shared" ]]; then
  mark_fail "shared_writable_by_deploy"
else
  mark_ok "shared_not_writable_by_deploy"
fi

probe="${HOME:?}/.cache/audiolad/_preflight_probe"
if mkdir -p "$probe" 2>/dev/null; then
  rmdir "$probe" 2>/dev/null || true
  mark_ok "deploy_home_cache_writable"
else
  mark_fail "deploy_home_cache_not_writable"
fi

check_sbin() {
  local name="$1"
  local path="/usr/local/sbin/${name}"
  if [[ ! -x "$path" ]]; then
    mark_fail "sbin_missing_${name}"
    return
  fi
  local err
  err="$(mktemp)"
  if sudo -n "$path" </dev/null 2>"$err"; then
    mark_ok "sbin_runs_without_password_${name}"
  elif grep -qiE 'not allowed|password is required' "$err"; then
    mark_fail "sudo_denied_${name}"
  else
    mark_fail "sbin_failed_${name}"
    sed 's/^/  /' "$err" >&2 || true
  fi
  rm -f "$err"
}

# status exits quickly; trusted-bundle without stdin fails layout but proves sudo
check_sbin_quick() {
  local name="$1"
  local path="/usr/local/sbin/${name}"
  if [[ ! -x "$path" ]]; then
    mark_fail "sbin_missing_${name}"
    return
  fi
  if sudo -n -l 2>/dev/null | grep -Fq "$path"; then
    mark_ok "sudoers_lists_${name}"
  else
    mark_fail "sudoers_missing_${name}"
  fi
}

check_sbin_quick audiolad-music-storage-bulk-sudo-bootstrap
check_sbin_quick audiolad-music-storage-bulk-install
check_sbin_quick audiolad-music-storage-bulk-ops-diag
check_sbin_quick audiolad-music-storage-bulk-ops-trusted-bundle
if sudo -n -l 2>/dev/null | grep -Fq 'audiolad-maintenance.sh --dry-run'; then
  mark_ok "sudoers_lists_audiolad-maintenance_dry_run"
else
  mark_fail "sudoers_missing_audiolad-maintenance"
fi

if [[ -L "${DEPLOY_ROOT}/current" ]]; then
  mark_ok "current_release_link"
else
  mark_fail "current_release_missing"
fi

if (( fail > 0 )); then
  printf '%s\n' "OPS_MUSIC_STORAGE_BULK_OPS_PREFLIGHT_END=incomplete"
  exit 1
fi
printf '%s\n' "OPS_MUSIC_STORAGE_BULK_OPS_PREFLIGHT_END=ok"