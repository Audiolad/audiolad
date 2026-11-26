#!/usr/bin/env bash
# Deploy-user entry: bootstrap privileged assets, then root install.
# GHA fetches this script from origin/main (trusted helper).
set -Eeuo pipefail

_REMOTE_LIB="$(dirname "${BASH_SOURCE[0]:-}")/audiolad-music-storage-bulk-ops-remote-lib.sh"
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != bash && -f "$_REMOTE_LIB" ]]; then
  # shellcheck source=audiolad-music-storage-bulk-ops-remote-lib.sh
  source "$_REMOTE_LIB"
else
  audiolad_music_bulk_sbin_path() {
    local act="$1"
    local root="${MUSIC_STORAGE_BULK_SBIN_ROOT:-/usr/local/sbin}"
    case "$act" in
      bootstrap) printf '%s/audiolad-music-storage-bulk-sudo-bootstrap' "$root" ;;
      install) printf '%s/audiolad-music-storage-bulk-install' "$root" ;;
      *) return 1 ;;
    esac
  }
  audiolad_music_bulk_deploy_user_can_execute() {
    local path="$1"
    [[ -e "$path" ]] && [[ -r "$path" ]] && [[ -x "$path" ]]
  }
  audiolad_music_bulk_sudo_stderr_is_denial() {
    local err_file="$1"
    grep -qiE 'a password is required|not allowed to execute|sorry, user .+ is not allowed' "$err_file"
  }
  audiolad_music_bulk_invoke_privileged_sbin() {
    local sbin="$1"
    local err
    err="$(mktemp)"
    trap "rm -f '$err'" RETURN
    if ! sudo -n "$sbin" 2>"$err"; then
      local rc=$?
      if audiolad_music_bulk_sudo_stderr_is_denial "$err"; then
        printf '{"error":"privileged_ops_sudo_denied","path":"%s"}\n' "$sbin" >&2
        return "$rc"
      fi
      cat "$err" >&2
      return "$rc"
    fi
    return 0
  }
fi

if [[ "$(id -u)" -eq 0 ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  exec "${SCRIPT_DIR}/audiolad-music-storage-bulk-root-install.sh"
fi

BOOT="$(audiolad_music_bulk_sbin_path bootstrap)"
INSTALL="$(audiolad_music_bulk_sbin_path install)"

if ! audiolad_music_bulk_deploy_user_can_execute "$BOOT"; then
  printf '%s\n' "{\"error\":\"music_storage_bulk_sudo_bootstrap_missing\",\"path\":\"${BOOT}\",\"hint\":\"run_production_DEPLOY_once_then_retry_OPS_INSTALL\"}" >&2
  exit 1
fi

if ! audiolad_music_bulk_invoke_privileged_sbin "$BOOT"; then
  printf '%s\n' '{"error":"music_storage_bulk_sudo_bootstrap_failed"}' >&2
  exit 1
fi

if ! audiolad_music_bulk_deploy_user_can_execute "$INSTALL"; then
  printf '%s\n' "{\"error\":\"music_storage_bulk_install_sbin_missing\",\"path\":\"${INSTALL}\"}" >&2
  exit 1
fi

exec sudo -n "$INSTALL"