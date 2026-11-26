#!/usr/bin/env bash
# Remote ops entry for GHA production-deploy music-storage bulk controls.
# Never invokes audiolad-deploy. Hardcoded actions only; uses narrow sudo wrappers.
# File presence: deploy-user test -x (sudo does NOT allow arbitrary `test`).
set -Eeuo pipefail

ACTION="${1:-status}"

_EMBED_LIB=0
_REMOTE_LIB="$(dirname "${BASH_SOURCE[0]:-}")/audiolad-music-storage-bulk-ops-remote-lib.sh"
if [[ -n "${BASH_SOURCE[0]:-}" && "${BASH_SOURCE[0]}" != bash && -f "$_REMOTE_LIB" ]]; then
  # shellcheck source=audiolad-music-storage-bulk-ops-remote-lib.sh
  source "$_REMOTE_LIB"
else
  _EMBED_LIB=1
fi

if (( _EMBED_LIB )); then
  audiolad_music_bulk_sbin_root() {
    printf '%s\n' "${MUSIC_STORAGE_BULK_SBIN_ROOT:-/usr/local/sbin}"
  }
  audiolad_music_bulk_sbin_path() {
    local act="$1"
    local root
    root="$(audiolad_music_bulk_sbin_root)"
    case "$act" in
      status) printf '%s/audiolad-music-storage-bulk-ops-status' "$root" ;;
      start_copy) printf '%s/audiolad-music-storage-bulk-ops-start-copy' "$root" ;;
      pause) printf '%s/audiolad-music-storage-bulk-ops-pause' "$root" ;;
      resume) printf '%s/audiolad-music-storage-bulk-ops-resume' "$root" ;;
      stop) printf '%s/audiolad-music-storage-bulk-ops-stop' "$root" ;;
      bootstrap) printf '%s/audiolad-music-storage-bulk-sudo-bootstrap' "$root" ;;
      *) return 1 ;;
    esac
  }
  audiolad_music_bulk_deploy_user_can_execute() {
    local path="$1"
    [[ -e "$path" ]] && [[ -r "$path" ]] && [[ -x "$path" ]]
  }
  audiolad_music_bulk_emit_sbin_missing() {
    local path="$1"
    if [[ ! -e "$path" ]]; then
      printf '{"error":"privileged_ops_sbin_missing","path":"%s","reason":"not_found"}\n' "$path" >&2
    elif [[ ! -x "$path" ]]; then
      printf '{"error":"privileged_ops_sbin_missing","path":"%s","reason":"not_executable"}\n' "$path" >&2
    else
      printf '{"error":"privileged_ops_sbin_missing","path":"%s","reason":"not_readable"}\n' "$path" >&2
    fi
  }
  audiolad_music_bulk_sudo_stderr_is_denial() {
    local err_file="$1"
    grep -qiE 'a password is required|not allowed to execute|sorry, user .+ is not allowed' "$err_file"
  }
  audiolad_music_bulk_invoke_privileged_sbin() {
    local sbin="$1"
    local err
    err="$(mktemp)"
    # shellcheck disable=SC2064
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
  audiolad_music_bulk_maybe_bootstrap() {
    local boot
    boot="$(audiolad_music_bulk_sbin_path bootstrap)" || return 1
    if ! audiolad_music_bulk_deploy_user_can_execute "$boot"; then
      printf '{"error":"music_storage_bulk_privileged_assets_missing","missing":"%s"}\n' "$boot" >&2
      return 1
    fi
    audiolad_music_bulk_invoke_privileged_sbin "$boot"
  }
fi

case "$ACTION" in
  status|start_copy|pause|resume|stop) ;;
  *)
    printf '%s\n' '{"error":"unknown_action"}' >&2
    exit 2
    ;;
esac

SBIN="$(audiolad_music_bulk_sbin_path "$ACTION")"

if ! audiolad_music_bulk_deploy_user_can_execute "$SBIN"; then
  if ! audiolad_music_bulk_maybe_bootstrap; then
    exit 1
  fi
fi

if ! audiolad_music_bulk_deploy_user_can_execute "$SBIN"; then
  audiolad_music_bulk_emit_sbin_missing "$SBIN"
  exit 1
fi

audiolad_music_bulk_invoke_privileged_sbin "$SBIN"