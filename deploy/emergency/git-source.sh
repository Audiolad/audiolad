#!/usr/bin/env bash
# Fixed-command switch for the production git object store.
# Install target (not performed by this repo change):
#   /usr/local/sbin/audiolad-emergency-git-source
#
# Allowed argv only: status | activate-mirror | restore-github
# URLs come from the root-owned config file, never from argv.
# Does not run deploy.sh and does not open a shell.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
Usage: audiolad-emergency-git-source status|activate-mirror|restore-github

status           print origin_role and the production SHA. No fetch.
activate-mirror  point origin at EMERGENCY_MIRROR_URL after proving the
                 current production commit is contained in mirror main.
restore-github   point origin back at GITHUB_ORIGIN_URL only when GitHub
                 already contains every commit on the current origin/main.

Config file (not argv):
  /etc/audiolad/emergency-git.env
Test override: AUDIOLAD_EMERGENCY_TEST=1 and AUDIOLAD_EMERGENCY_GIT_CONFIG
pointing at a file. Test paths must stay under /tmp or /var/tmp.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 ]]; then
  emergency_die "exactly one command is required"
fi
COMMAND="$1"
case "$COMMAND" in
  status|activate-mirror|restore-github) ;;
  *) emergency_die "unknown command" ;;
esac

if [[ "${AUDIOLAD_EMERGENCY_TEST:-}" == "1" ]]; then
  CONFIG_FILE="${AUDIOLAD_EMERGENCY_GIT_CONFIG:?AUDIOLAD_EMERGENCY_GIT_CONFIG is required in test mode}"
  case "$CONFIG_FILE" in
    /tmp/*|/var/tmp/*) ;;
    *) emergency_die "test config must live under /tmp or /var/tmp" ;;
  esac
else
  CONFIG_FILE=/etc/audiolad/emergency-git.env
fi

unset EMERGENCY_MIRROR_URL GITHUB_ORIGIN_URL GIT_WORKDIR DEPLOY_ROOT AUDIT_LOG STATE_DIR
unset ALLOW_FILE_MIRROR ALLOW_HTTP_MIRROR
ALLOW_FILE_MIRROR=0
ALLOW_HTTP_MIRROR=0

while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    ''|\#*) continue ;;
    EMERGENCY_MIRROR_URL=*|GITHUB_ORIGIN_URL=*|GIT_WORKDIR=*|DEPLOY_ROOT=*|AUDIT_LOG=*|STATE_DIR=*|ALLOW_FILE_MIRROR=*|ALLOW_HTTP_MIRROR=*)
      key="${line%%=*}"
      value="${line#*=}"
      emergency_reject_metacharacters "$value" "$key"
      printf -v "$key" '%s' "$value"
      ;;
    *)
      emergency_die "unknown config key in emergency git config"
      ;;
  esac
done <"$CONFIG_FILE"

: "${EMERGENCY_MIRROR_URL:?EMERGENCY_MIRROR_URL is required}"
: "${GITHUB_ORIGIN_URL:?GITHUB_ORIGIN_URL is required}"
: "${GIT_WORKDIR:?GIT_WORKDIR is required}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"
AUDIT_LOG="${AUDIT_LOG:-/var/log/audiolad/emergency-git-source.log}"
STATE_DIR="${STATE_DIR:-/var/lib/audiolad/emergency}"

if [[ "${AUDIOLAD_EMERGENCY_TEST:-}" == "1" ]]; then
  for path in "$GIT_WORKDIR" "$DEPLOY_ROOT" "$AUDIT_LOG" "$STATE_DIR"; do
    case "$path" in
      /tmp/*|/var/tmp/*) ;;
      *) emergency_die "test mode refuses path outside /tmp: ${path}" ;;
    esac
  done
fi

emergency_validate_mirror_url "$EMERGENCY_MIRROR_URL"
emergency_validate_source_url "$GITHUB_ORIGIN_URL"
export GIT_TERMINAL_PROMPT=0

origin_url="$(git -C "$GIT_WORKDIR" remote get-url origin)"
if [[ "$origin_url" == "$EMERGENCY_MIRROR_URL" ]]; then
  ORIGIN_ROLE=mirror
elif [[ "$origin_url" == "$GITHUB_ORIGIN_URL" ]]; then
  ORIGIN_ROLE=github
else
  ORIGIN_ROLE=unknown
fi

production_sha=""
if [[ -r "$DEPLOY_ROOT/current/.deploy-commit" ]]; then
  production_sha="$(tr -d '[:space:]' <"$DEPLOY_ROOT/current/.deploy-commit")"
fi

url_host() {
  local url="$1"
  case "$url" in
    file://*) printf 'file' ;;
    ssh://git@*)
      local rest="${url#ssh://git@}"
      printf '%s' "${rest%%[:/]*}"
      ;;
    git@*)
      local rest="${url#git@}"
      printf '%s' "${rest%%:*}"
      ;;
    https://*|http://*)
      local rest="${url#*://}"
      printf '%s' "${rest%%/*}"
      ;;
    *) printf 'unknown' ;;
  esac
}

if [[ "$COMMAND" == "status" ]]; then
  printf 'origin_role=%s\n' "$ORIGIN_ROLE"
  printf 'origin_host=%s\n' "$(url_host "$origin_url")"
  printf 'production_sha=%s\n' "${production_sha:-missing}"
  exit 0
fi

[[ "$production_sha" =~ ^[0-9a-f]{40}$ ]] || emergency_die "production .deploy-commit is missing or not a SHA"

fetch_ref() {
  local remote_name="$1"
  local url="$2"
  local dst_ref="$3"
  if git -C "$GIT_WORKDIR" remote get-url "$remote_name" >/dev/null 2>&1; then
    git -C "$GIT_WORKDIR" remote set-url "$remote_name" "$url"
  else
    git -C "$GIT_WORKDIR" remote add "$remote_name" "$url"
  fi
  git -C "$GIT_WORKDIR" fetch "$remote_name" "+refs/heads/main:${dst_ref}"
}

if [[ "$COMMAND" == "activate-mirror" ]]; then
  fetch_ref emergency-mirror "$EMERGENCY_MIRROR_URL" refs/remotes/emergency-mirror/main
  if ! git -C "$GIT_WORKDIR" merge-base --is-ancestor "$production_sha" refs/remotes/emergency-mirror/main; then
    emergency_audit "$AUDIT_LOG" "activate-mirror" "$production_sha" "refused" "production commit is not in mirror main"
    emergency_die "mirror main does not contain production commit ${production_sha}"
  fi
  mkdir -p "$STATE_DIR"
  printf 'previous_origin=%s\n' "$origin_url" >"${STATE_DIR}/origin-state"
  git -C "$GIT_WORKDIR" remote set-url origin "$EMERGENCY_MIRROR_URL"
  git -C "$GIT_WORKDIR" fetch origin main
  git -C "$GIT_WORKDIR" remote remove emergency-mirror || true
  emergency_audit "$AUDIT_LOG" "activate-mirror" "$production_sha" "ok" "origin_role=mirror"
  emergency_log "origin_role=mirror production_sha=${production_sha}"
  exit 0
fi

fetch_ref emergency-github "$GITHUB_ORIGIN_URL" refs/remotes/emergency-github/main
git -C "$GIT_WORKDIR" fetch origin main
if ! git -C "$GIT_WORKDIR" merge-base --is-ancestor origin/main refs/remotes/emergency-github/main; then
  emergency_audit "$AUDIT_LOG" "restore-github" "$production_sha" "refused" "origin/main is not contained in GitHub main"
  emergency_die "GitHub main is missing commits from the current origin. Run resync-to-github.sh before restore-github."
fi
git -C "$GIT_WORKDIR" remote set-url origin "$GITHUB_ORIGIN_URL"
git -C "$GIT_WORKDIR" fetch origin main
git -C "$GIT_WORKDIR" remote remove emergency-github || true
emergency_audit "$AUDIT_LOG" "restore-github" "$(git -C "$GIT_WORKDIR" rev-parse origin/main)" "ok" "origin_role=github"
emergency_log "origin_role=github"
