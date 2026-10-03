#!/usr/bin/env bash
# Push-mirror enabled Audiolad repos from GitHub (or a test source) into the
# emergency Git remote while the recorded primary is GitHub.
# Refuses after promotion so a later sync cannot erase emergency commits.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

usage() {
  cat <<'EOF'
Usage: sync-from-github.sh [--verify-history]

Mirrors every enabled line in the repo list from EMERGENCY_GITHUB_BASE
(default https://github.com) into EMERGENCY_MIRROR_BASE.

Required environment:
  EMERGENCY_MIRROR_ROOT   bare-mirror cache directory
  EMERGENCY_STATE_DIR     primary flag and manifests
  EMERGENCY_MIRROR_BASE   destination base URL (no secret userinfo)

Optional:
  EMERGENCY_GITHUB_BASE   default https://github.com
  EMERGENCY_REPO_LIST     default deploy/emergency/repos.list
  EMERGENCY_MIRROR_BACKEND  git (default) or gitea
  GITEA_BASE_URL GITEA_TOKEN GITEA_USERNAME
      required when backend=gitea; token is never printed
  ALLOW_FILE_MIRROR=1     test-only file:// remotes
  ALLOW_HTTP_MIRROR=1     required for https:// mirror bases

Does not deploy. Does not change production origin. Does not run when
the recorded primary is gitea.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

VERIFY_HISTORY=0
if [[ "${1:-}" == "--verify-history" ]]; then
  VERIFY_HISTORY=1
  shift
fi
if [[ $# -ne 0 ]]; then
  emergency_die "unexpected arguments. See --help."
fi

: "${EMERGENCY_MIRROR_ROOT:?EMERGENCY_MIRROR_ROOT is required}"
: "${EMERGENCY_STATE_DIR:?EMERGENCY_STATE_DIR is required}"
: "${EMERGENCY_MIRROR_BASE:?EMERGENCY_MIRROR_BASE is required}"
EMERGENCY_GITHUB_BASE="${EMERGENCY_GITHUB_BASE:-https://github.com}"
EMERGENCY_MIRROR_BACKEND="${EMERGENCY_MIRROR_BACKEND:-git}"
EMERGENCY_REPO_LIST="${EMERGENCY_REPO_LIST:-$SCRIPT_DIR/../repos.list}"
AUDIT_LOG="${EMERGENCY_AUDIT_LOG:-$EMERGENCY_STATE_DIR/audit.log}"
export GIT_TERMINAL_PROMPT=0

emergency_validate_source_url "${EMERGENCY_GITHUB_BASE}/Audiolad/audiolad.git"
emergency_validate_mirror_url "${EMERGENCY_MIRROR_BASE}/Audiolad/audiolad.git"

primary="$(emergency_read_primary "$EMERGENCY_STATE_DIR")"
if [[ "$primary" != "github" ]]; then
  emergency_audit "$AUDIT_LOG" "sync-from-github" "-" "refused" "primary=${primary}"
  emergency_die "refusing sync: emergency primary is ${primary}. Sync would overwrite emergency commits."
fi

trap emergency_clear_askpass EXIT

if [[ "$EMERGENCY_MIRROR_BACKEND" == "gitea" ]]; then
  : "${GITEA_BASE_URL:?GITEA_BASE_URL is required for backend=gitea}"
  : "${GITEA_TOKEN:?GITEA_TOKEN is required for backend=gitea}"
  : "${GITEA_USERNAME:?GITEA_USERNAME is required for backend=gitea}"
  emergency_prepare_askpass
  # shellcheck source=ensure-gitea-repo.sh
  source "$SCRIPT_DIR/ensure-gitea-repo.sh"
fi

ensure_file_dest() {
  local url="$1"
  local path
  path="$(emergency_file_url_path "$url")" || return 0
  if [[ ! -d "$path" ]]; then
    mkdir -p "$(dirname "$path")"
    git init --bare -q -b main "$path"
  fi
}

update_cache() {
  local cache="$1"
  local github_url="$2"
  mkdir -p "$(dirname "$cache")"
  if [[ ! -d "$cache" ]]; then
    git init --bare -q "$cache"
    git -C "$cache" remote add origin "$github_url"
  else
    git -C "$cache" remote set-url origin "$github_url"
  fi
  git -C "$cache" config --unset-all remote.origin.fetch || true
  git -C "$cache" config remote.origin.fetch '+refs/heads/*:refs/heads/*'
  git -C "$cache" config --add remote.origin.fetch '+refs/tags/*:refs/tags/*'
  git -C "$cache" config remote.origin.prune true
  git -C "$cache" config fetch.pruneTags true
  git -C "$cache" fetch --prune origin
}

dest_url_for() {
  local owner="$1"
  local repo="$2"
  emergency_join_url "$EMERGENCY_MIRROR_BASE" "${owner}/${repo}.git"
}

github_url_for() {
  local slug="$1"
  emergency_join_url "$EMERGENCY_GITHUB_BASE" "${slug}.git"
}

push_mirror_refs() {
  local cache="$1"
  local dest_url="$2"
  local name
  emergency_git git -C "$cache" push "$dest_url" 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if ! git -C "$cache" show-ref --verify --quiet "refs/heads/${name}"; then
      emergency_git git -C "$cache" push "$dest_url" ":refs/heads/${name}"
    fi
  done < <(emergency_git git ls-remote --heads "$dest_url" | awk '{sub(/^refs\/heads\//, "", $2); print $2}')
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if ! git -C "$cache" show-ref --verify --quiet "refs/tags/${name}"; then
      emergency_git git -C "$cache" push "$dest_url" ":refs/tags/${name}"
    fi
  done < <(emergency_git git ls-remote --tags "$dest_url" | awk '$2 !~ /\^\{\}$/ {sub(/^refs\/tags\//, "", $2); print $2}')
}

compare_refs() {
  local cache="$1"
  local dest_url="$2"
  local src_list dest_list
  src_list="$(mktemp)"
  dest_list="$(mktemp)"
  git -C "$cache" for-each-ref --format='%(objectname) %(refname)' 'refs/heads' 'refs/tags' | sort >"$src_list"
  emergency_git git ls-remote "$dest_url" 'refs/heads/*' 'refs/tags/*' \
    | awk '$2 !~ /\^\{\}$/ {print $1" "$2}' | sort >"$dest_list"
  if ! diff -u "$src_list" "$dest_list" >/dev/null; then
    diff -u "$src_list" "$dest_list" >&2 || true
    rm -f "$src_list" "$dest_list"
    emergency_die "mirror refs do not match source heads and tags"
  fi
  rm -f "$src_list" "$dest_list"
}

verify_history() {
  local cache="$1"
  local dest_url="$2"
  local tmp count_src count_dst
  tmp="$(mktemp -d)"
  if ! emergency_git git clone --bare -q "$dest_url" "$tmp/verify.git"; then
    rm -rf "$tmp"
    emergency_die "history verify clone of destination failed"
  fi
  count_src="$(git -C "$cache" rev-list --count refs/heads/main)"
  count_dst="$(git -C "$tmp/verify.git" rev-list --count refs/heads/main)"
  rm -rf "$tmp"
  if [[ "$count_src" != "$count_dst" ]]; then
    emergency_die "history length mismatch main source=${count_src} mirror=${count_dst}"
  fi
  emergency_log "history_ok main_commits=${count_src}"
}

mirrored=0
while IFS=$'\t' read -r slug owner repo; do
  github_url="$(github_url_for "$slug")"
  dest_url="$(dest_url_for "$owner" "$repo")"
  emergency_validate_source_url "$github_url"
  emergency_validate_mirror_url "$dest_url"
  if [[ "$EMERGENCY_MIRROR_BACKEND" == "gitea" ]]; then
    emergency_gitea_ensure_repo "$owner" "$repo"
  fi
  ensure_file_dest "$dest_url"
  cache="$(emergency_cache_dir_for_slug "$EMERGENCY_MIRROR_ROOT" "$slug")"
  emergency_log "sync slug=${slug}"
  update_cache "$cache" "$github_url"
  push_mirror_refs "$cache" "$dest_url"
  compare_refs "$cache" "$dest_url"
  if [[ "$VERIFY_HISTORY" == "1" ]]; then
    verify_history "$cache" "$dest_url"
  fi
  main_sha="$(git -C "$cache" rev-parse refs/heads/main)"
  manifest_dir="${EMERGENCY_STATE_DIR}/manifests"
  mkdir -p "$manifest_dir"
  safe="${slug//\//__}"
  cat >"${manifest_dir}/${safe}" <<EOF
slug=${slug}
main=${main_sha}
synced_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
  emergency_audit "$AUDIT_LOG" "sync-from-github" "$main_sha" "ok" "slug=${slug}"
  mirrored=$((mirrored + 1))
done < <(emergency_each_enabled_repo "$EMERGENCY_REPO_LIST")

if [[ "$mirrored" -lt 1 ]]; then
  emergency_die "repo list has no enabled repositories"
fi
emergency_log "sync_complete repos=${mirrored} primary=github"
