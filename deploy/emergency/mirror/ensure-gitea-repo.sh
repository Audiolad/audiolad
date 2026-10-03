#!/usr/bin/env bash
# Sourced by sync-from-github.sh when EMERGENCY_MIRROR_BACKEND=gitea.
# Creates a private org repo if missing. Never prints GITEA_TOKEN.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf 'ERROR: source ensure-gitea-repo.sh from sync-from-github.sh\n' >&2
  exit 1
fi

emergency_gitea_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${GITEA_BASE_URL%/}${path}"
  local args=(
    curl --silent --show-error --max-time 30
    -H "Authorization: token ${GITEA_TOKEN}"
    -H "Content-Type: application/json"
    -H "Accept: application/json"
    -X "$method"
    -w '\n%{http_code}'
  )
  if [[ -n "$body" ]]; then
    args+=(--data "$body")
  fi
  args+=("$url")
  local raw http
  raw="$("${args[@]}")" || emergency_die "Gitea API request failed for ${path}"
  http="${raw##*$'\n'}"
  local payload="${raw%$'\n'*}"
  printf '%s\n' "$http"
  printf '%s' "$payload" >"${EMERGENCY_GITEA_LAST_BODY:-/dev/null}" 2>/dev/null || true
  EMERGENCY_GITEA_HTTP="$http"
  EMERGENCY_GITEA_BODY="$payload"
}

emergency_gitea_ensure_repo() {
  local owner="$1"
  local repo="$2"
  local tmp http
  tmp="$(mktemp)"
  EMERGENCY_GITEA_LAST_BODY="$tmp"

  emergency_gitea_api GET "/api/v1/orgs/${owner}" || true
  http="$EMERGENCY_GITEA_HTTP"
  if [[ "$http" == "404" ]]; then
    emergency_gitea_api POST "/api/v1/orgs" \
      "{\"username\":\"${owner}\",\"visibility\":\"private\"}"
    http="$EMERGENCY_GITEA_HTTP"
    if [[ "$http" != "201" && "$http" != "409" ]]; then
      rm -f "$tmp"
      emergency_die "Gitea org create failed http=${http}"
    fi
  elif [[ "$http" != "200" ]]; then
    rm -f "$tmp"
    emergency_die "Gitea org lookup failed http=${http}"
  fi

  emergency_gitea_api GET "/api/v1/repos/${owner}/${repo}" || true
  http="$EMERGENCY_GITEA_HTTP"
  if [[ "$http" == "404" ]]; then
    emergency_gitea_api POST "/api/v1/orgs/${owner}/repos" \
      "{\"name\":\"${repo}\",\"private\":true,\"auto_init\":false}"
    http="$EMERGENCY_GITEA_HTTP"
    if [[ "$http" != "201" && "$http" != "409" ]]; then
      rm -f "$tmp"
      emergency_die "Gitea repo create failed http=${http}"
    fi
  elif [[ "$http" != "200" ]]; then
    rm -f "$tmp"
    emergency_die "Gitea repo lookup failed http=${http}"
  else
    if ! printf '%s' "$EMERGENCY_GITEA_BODY" | grep -Eq '"private"[[:space:]]*:[[:space:]]*true'; then
      rm -f "$tmp"
      emergency_die "Gitea repo ${owner}/${repo} exists but is not private"
    fi
  fi
  rm -f "$tmp"
  emergency_log "gitea_repo_ready ${owner}/${repo} private=yes"
}
