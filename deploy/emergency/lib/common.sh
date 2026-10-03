#!/usr/bin/env bash
# Shared helpers for the emergency Git mirror and deploy contour.
# Source this file. Do not execute it.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf 'ERROR: source deploy/emergency/lib/common.sh; do not execute it.\n' >&2
  exit 1
fi

emergency_die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

emergency_log() {
  printf '[emergency] %s\n' "$*"
}

emergency_actor() {
  if [[ -n "${EMERGENCY_ACTOR:-}" ]]; then
    printf '%s' "$EMERGENCY_ACTOR"
    return 0
  fi
  printf '%s@%s' "$(id -un 2>/dev/null || echo unknown)" "$(hostname -s 2>/dev/null || echo host)"
}

emergency_reject_metacharacters() {
  local value="$1"
  local label="$2"
  local forbidden char index
  forbidden="$(printf '%s' $'\n\r$;|&! ')"
  forbidden="${forbidden}\`"
  for ((index = 0; index < ${#forbidden}; index++)); do
    char="${forbidden:index:1}"
    if [[ "$value" == *"$char"* ]]; then
      emergency_die "${label} contains a forbidden character"
    fi
  done
}

emergency_audit() {
  local file="$1"
  local action="$2"
  local sha="$3"
  local result="$4"
  local detail="$5"
  local actor
  actor="$(emergency_actor)"
  emergency_reject_metacharacters "$actor" "EMERGENCY_ACTOR"
  mkdir -p "$(dirname "$file")"
  printf '%s\tactor=%s\taction=%s\tsha=%s\tresult=%s\tdetail=%s\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "$actor" \
    "$action" \
    "$sha" \
    "$result" \
    "$detail" >>"$file"
}

EMERGENCY_ASKPASS_DIR=""

emergency_prepare_askpass() {
  if [[ -z "${GITEA_TOKEN:-}" ]]; then
    return 0
  fi
  : "${GITEA_USERNAME:?GITEA_USERNAME is required when GITEA_TOKEN is set}"
  if [[ -n "$EMERGENCY_ASKPASS_DIR" ]]; then
    return 0
  fi
  EMERGENCY_ASKPASS_DIR="$(mktemp -d)"
  cat >"${EMERGENCY_ASKPASS_DIR}/askpass" <<'EOF'
#!/bin/sh
case "$1" in
  Username*) printf '%s\n' "${GIT_ASKPASS_USERNAME}" ;;
  *) printf '%s\n' "${GIT_ASKPASS_PASSWORD}" ;;
esac
EOF
  chmod 0700 "${EMERGENCY_ASKPASS_DIR}/askpass"
}

emergency_clear_askpass() {
  if [[ -n "$EMERGENCY_ASKPASS_DIR" ]]; then
    rm -rf "$EMERGENCY_ASKPASS_DIR"
    EMERGENCY_ASKPASS_DIR=""
  fi
}

emergency_git() {
  emergency_prepare_askpass
  if [[ -n "$EMERGENCY_ASKPASS_DIR" ]]; then
    GIT_ASKPASS="${EMERGENCY_ASKPASS_DIR}/askpass" \
      GIT_ASKPASS_USERNAME="${GITEA_USERNAME}" \
      GIT_ASKPASS_PASSWORD="${GITEA_TOKEN}" \
      GIT_TERMINAL_PROMPT=0 \
      "$@"
  else
    GIT_TERMINAL_PROMPT=0 "$@"
  fi
}

emergency_redact_stream() {
  if [[ -n "${GITEA_TOKEN:-}" ]]; then
    sed "s#${GITEA_TOKEN}#***#g"
  else
    cat
  fi
}

emergency_each_enabled_repo() {
  local list_file="$1"
  local slug owner repo enabled
  [[ -f "$list_file" ]] || emergency_die "repo list not found: ${list_file}"
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    slug="${line%%|*}"
    local rest="${line#*|}"
    owner="${rest%%|*}"
    rest="${rest#*|}"
    repo="${rest%%|*}"
    enabled="${rest#*|}"
    [[ "$enabled" == "yes" ]] || continue
    [[ -n "$slug" && -n "$owner" && -n "$repo" ]] || emergency_die "malformed repo line: ${line}"
    emergency_reject_metacharacters "$slug" "github slug"
    emergency_reject_metacharacters "$owner" "gitea owner"
    emergency_reject_metacharacters "$repo" "gitea repo"
    printf '%s\t%s\t%s\n' "$slug" "$owner" "$repo"
  done <"$list_file"
}

emergency_cache_dir_for_slug() {
  local root="$1"
  local slug="$2"
  local safe="${slug//\//__}"
  printf '%s/mirrors/%s.git' "$root" "$safe"
}

emergency_read_primary() {
  local state_dir="$1"
  local state_file="${state_dir}/primary"
  if [[ ! -f "$state_file" ]]; then
    printf 'github'
    return 0
  fi
  local value
  value="$(tr -d '[:space:]' <"$state_file")"
  case "$value" in
    github|gitea) printf '%s' "$value" ;;
    *) emergency_die "unknown emergency primary: ${value}" ;;
  esac
}

emergency_write_primary() {
  local state_dir="$1"
  local value="$2"
  case "$value" in
    github|gitea) ;;
    *) emergency_die "refusing to record primary=${value}" ;;
  esac
  mkdir -p "$state_dir"
  printf '%s\n' "$value" >"${state_dir}/primary"
}

emergency_join_url() {
  local base="$1"
  local path="$2"
  base="${base%/}"
  printf '%s/%s' "$base" "$path"
}

emergency_file_url_path() {
  local url="$1"
  case "$url" in
    file://*) printf '%s' "${url#file://}" ;;
    *) return 1 ;;
  esac
}

emergency_reject_embedded_http_credentials() {
  local url="$1"
  local label="$2"
  case "$url" in
    http://*@*|https://*@*)
      emergency_die "${label} must not embed credentials"
      ;;
  esac
}

emergency_validate_source_url() {
  local url="$1"
  emergency_reject_metacharacters "$url" "source url"
  emergency_reject_embedded_http_credentials "$url" "source url"
  case "$url" in
    file:///*)
      if [[ "${ALLOW_FILE_MIRROR:-0}" != "1" ]]; then
        emergency_die "source url uses file:// but ALLOW_FILE_MIRROR is not 1"
      fi
      ;;
    ssh://git@*|git@*|https://*)
      ;;
    *)
      emergency_die "source url must be https://, ssh://git@, git@, or file:///"
      ;;
  esac
}

emergency_validate_mirror_url() {
  local url="$1"
  emergency_reject_metacharacters "$url" "mirror url"
  emergency_reject_embedded_http_credentials "$url" "mirror url"
  case "$url" in
    file:///*)
      if [[ "${ALLOW_FILE_MIRROR:-0}" != "1" ]]; then
        emergency_die "mirror url uses file:// but ALLOW_FILE_MIRROR is not 1"
      fi
      ;;
    https://*|http://*)
      if [[ "${ALLOW_HTTP_MIRROR:-0}" != "1" ]]; then
        emergency_die "mirror url uses HTTP but ALLOW_HTTP_MIRROR is not 1"
      fi
      ;;
    ssh://git@*|git@*)
      ;;
    *)
      emergency_die "mirror url must be ssh://git@, git@, https://, or file:///"
      ;;
  esac
}
