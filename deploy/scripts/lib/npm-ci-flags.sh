#!/usr/bin/env bash
# Optional offline npm ci flags for the canonical deploy.
#
# Default (file absent): argv is exactly `npm ci`. Production behavior does
# not change until an operator creates the flags file during an emergency.
# Unknown keys and unsafe paths fail closed.

read_npm_ci_argv() {
  NPM_CI_ARGV=(npm ci)
  local flags_file="${DEPLOY_ROOT}/shared/npm-ci-offline.env"
  if [[ ! -f "$flags_file" ]]; then
    return 0
  fi

  local line key value
  local offline=0
  local cache=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ ! "$line" =~ ^[A-Z0-9_]+=[^$'\n']*$ ]]; then
      log_error "npm-ci-offline.env line is not KEY=VALUE"
      return 1
    fi
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      NPM_CI_OFFLINE)
        if [[ "$value" != "1" ]]; then
          log_error "NPM_CI_OFFLINE must be 1"
          return 1
        fi
        offline=1
        ;;
      NPM_CI_CACHE)
        if [[ ! "$value" =~ ^/[A-Za-z0-9._~/-]+$ ]]; then
          log_error "NPM_CI_CACHE must be a plain absolute path"
          return 1
        fi
        cache="$value"
        ;;
      *)
        log_error "npm-ci-offline.env key is not allowed: ${key}"
        return 1
        ;;
    esac
  done <"$flags_file"

  if [[ "$offline" != "1" || -z "$cache" ]]; then
    log_error "npm-ci-offline.env requires NPM_CI_OFFLINE=1 and NPM_CI_CACHE"
    return 1
  fi
  if [[ ! -d "$cache" ]]; then
    log_error "NPM_CI_CACHE directory does not exist"
    return 1
  fi

  NPM_CI_ARGV+=(--offline --cache "$cache")
  return 0
}
