# shellcheck shell=bash
# Shared helpers for deploy-user GHA music-storage bulk ops (no sudo for file probes).
audiolad_music_bulk_sbin_root() {
  printf '%s\n' "${MUSIC_STORAGE_BULK_SBIN_ROOT:-/usr/local/sbin}"
}

audiolad_music_bulk_sbin_path() {
  local action="$1"
  local root
  root="$(audiolad_music_bulk_sbin_root)"
  case "$action" in
    status) printf '%s/audiolad-music-storage-bulk-ops-status' "$root" ;;
    start_copy) printf '%s/audiolad-music-storage-bulk-ops-start-copy' "$root" ;;
    pause) printf '%s/audiolad-music-storage-bulk-ops-pause' "$root" ;;
    resume) printf '%s/audiolad-music-storage-bulk-ops-resume' "$root" ;;
    stop) printf '%s/audiolad-music-storage-bulk-ops-stop' "$root" ;;
    bootstrap) printf '%s/audiolad-music-storage-bulk-sudo-bootstrap' "$root" ;;
    install) printf '%s/audiolad-music-storage-bulk-install' "$root" ;;
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
  if ! audiolad_music_bulk_invoke_privileged_sbin "$boot"; then
    return 1
  fi
  return 0
}