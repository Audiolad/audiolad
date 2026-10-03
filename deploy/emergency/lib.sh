#!/usr/bin/env bash
# Shared helpers for the Audiolad emergency contour.
# No production defaults. No secret printing.

emergency_die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

emergency_log() {
  printf '[emergency] %s\n' "$*"
}

redact_text() {
  sed -E \
    -e 's#://[^[:space:]/@]*@#://***@#g' \
    -e 's#(Authorization:[[:space:]]+)[^[:space:]]+#\1***#g' \
    -e 's#(token[[:space:]]+)[A-Za-z0-9._~+/-]{8,}#\1***#gi'
}

validate_sha() {
  local sha="$1"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || emergency_die "SHA must be 40 lowercase hex characters"
}

validate_operator() {
  local operator="$1"
  [[ "$operator" =~ ^[A-Za-z0-9._@-]{1,64}$ ]] || emergency_die "operator must match [A-Za-z0-9._@-]{1,64}"
}

require_exact_confirm() {
  local expected="$1"
  local actual="$2"
  [[ "$actual" == "$expected" ]] || emergency_die "confirmation must be exactly ${expected}"
}

refuse_github_target() {
  local url="$1"
  local lower
  if [[ "$url" == /* ]]; then
    return 0
  fi
  lower="${url,,}"
  case "$lower" in
    *github.com*|*githubusercontent.com*|*github.dev*)
      emergency_die "refusing GitHub as an emergency mirror target"
      ;;
  esac
}

validate_remote_url() {
  local url="$1"
  [[ "$url" != *$'\n'* && "$url" != *$'\r'* ]] || emergency_die "remote URL must be a single line"
  case "$url" in
    *'$'*|*\`*|*'|'|*'&'*|*';'*|*'<'*|*'>'*|*'('*|*')'*|*'{'*|*}*|*\\*)
      emergency_die "remote URL contains forbidden shell characters"
      ;;
  esac
  if [[ "$url" == /* ]]; then
    [[ "$url" =~ ^/[A-Za-z0-9._~/-]+$ ]] || emergency_die "local mirror path is not a plain absolute path"
    return 0
  fi
  [[ "$url" =~ ^(ssh|git|http|https)://[A-Za-z0-9._~:/?#@%+=,-]+$ ]] || emergency_die "remote URL scheme is not allowed"
}

join_target() {
  local base="$1"
  local rel="$2"
  rel="${rel#/}"
  printf '%s/%s\n' "${base%/}" "$rel"
}

append_audit() {
  local file="$1"
  shift
  mkdir -p "$(dirname "$file")"
  {
    if command -v flock >/dev/null 2>&1; then
      flock -w 5 9
    fi
    printf '%s\n' "$*" >&9
  } 9>>"$file"
}
