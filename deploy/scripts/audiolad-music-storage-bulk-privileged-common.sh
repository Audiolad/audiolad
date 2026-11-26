# shellcheck shell=bash
# Shared guards for music-storage bulk privileged scripts.
audiolad_music_storage_bulk_validate_release_tree() {
  local tree="$1"
  local root="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"

  if [[ -z "$tree" || ! -d "$tree" ]]; then
    printf '%s\n' '{"error":"deploy_tree_missing"}' >&2
    return 1
  fi

  local real
  real="$(readlink -f "$tree")"
  case "$real" in
    "${root}/releases"/*) ;;
    /var/lib/audiolad/gha-trusted-deploy/deploy) ;;
    *)
      if [[ "$real" == *"/.cache/audiolad/gha-trusted-deploy/deploy" ]]; then
        :
      else
        printf '%s\n' '{"error":"deploy_tree_outside_releases"}' >&2
        return 1
      fi
      ;;
  esac

  if [[ "$real" != "$tree" && "$(readlink -f "$tree")" != "$real" ]]; then
    printf '%s\n' '{"error":"deploy_tree_symlink_escape"}' >&2
    return 1
  fi

  return 0
}

audiolad_music_storage_bulk_validate_regular_file() {
  local path="$1"
  if [[ ! -f "$path" ]] || [[ -L "$path" ]]; then
    printf '%s\n' "{\"error\":\"invalid_regular_file\",\"path\":\"${path}\"}" >&2
    return 1
  fi
  if [[ -w "$path" ]] && [[ "$(stat -c '%U' "$path")" != "root" ]]; then
    # World/group writable non-root-owned source is not trusted for root install.
    local mode
    mode="$(stat -c '%a' "$path")"
    if [[ "$mode" =~ [2367]$ ]]; then
      printf '%s\n' "{\"error\":\"source_file_world_or_group_writable\",\"path\":\"${path}\"}" >&2
      return 1
    fi
  fi
  return 0
}