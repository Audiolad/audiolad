#!/usr/bin/env bash
# Fast-forward emergency mirror commits back to GitHub, then record
# primary=github. Refuses a non-fast-forward. Does not deploy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

usage() {
  cat <<'EOF'
Usage: resync-to-github.sh RESTORE_GITHUB_PRIMARY

Fetches the mirror and GitHub. Pushes mirror branches and tags to GitHub
only when every shared branch fast-forwards. Then records primary=github.

Does not use --force. Does not change production origin. After this
succeeds, the server-side command restore-github can point origin back
at GitHub without dropping commits.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ "${1:-}" != "RESTORE_GITHUB_PRIMARY" || $# -ne 1 ]]; then
  emergency_die "refusing GitHub restore without exact confirm token RESTORE_GITHUB_PRIMARY"
fi

: "${EMERGENCY_MIRROR_ROOT:?EMERGENCY_MIRROR_ROOT is required}"
: "${EMERGENCY_STATE_DIR:?EMERGENCY_STATE_DIR is required}"
: "${EMERGENCY_MIRROR_BASE:?EMERGENCY_MIRROR_BASE is required}"
EMERGENCY_GITHUB_BASE="${EMERGENCY_GITHUB_BASE:-https://github.com}"
EMERGENCY_REPO_LIST="${EMERGENCY_REPO_LIST:-$SCRIPT_DIR/../repos.list}"
AUDIT_LOG="${EMERGENCY_AUDIT_LOG:-$EMERGENCY_STATE_DIR/audit.log}"
export GIT_TERMINAL_PROMPT=0
trap emergency_clear_askpass EXIT

primary="$(emergency_read_primary "$EMERGENCY_STATE_DIR")"
if [[ "$primary" != "gitea" ]]; then
  emergency_die "refusing GitHub restore: primary is ${primary}, expected gitea"
fi

restore_one() {
  local slug="$1"
  local owner="$2"
  local repo="$3"
  local cache github_url dest_url
  cache="$(emergency_cache_dir_for_slug "$EMERGENCY_MIRROR_ROOT" "$slug")"
  github_url="$(emergency_join_url "$EMERGENCY_GITHUB_BASE" "${slug}.git")"
  dest_url="$(emergency_join_url "$EMERGENCY_MIRROR_BASE" "${owner}/${repo}.git")"
  emergency_validate_source_url "$github_url"
  emergency_validate_mirror_url "$dest_url"
  [[ -d "$cache" ]] || emergency_die "mirror cache missing for ${slug}"

  git -C "$cache" remote set-url origin "$github_url"
  git -C "$cache" fetch origin '+refs/heads/*:refs/github-heads/*' '+refs/tags/*:refs/github-tags/*'
  emergency_git git -C "$cache" fetch "$dest_url" '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*'

  local ref name gh_ref
  while IFS= read -r ref; do
    name="${ref#refs/heads/}"
    gh_ref="refs/github-heads/${name}"
    if git -C "$cache" show-ref --verify --quiet "$gh_ref"; then
      if ! git -C "$cache" merge-base --is-ancestor "$gh_ref" "$ref"; then
        emergency_die "branch ${name} on the mirror is not a fast-forward of GitHub for ${slug}"
      fi
    fi
  done < <(git -C "$cache" for-each-ref --format='%(refname)' refs/heads)

  git -C "$cache" push origin 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
  local main_sha
  main_sha="$(git -C "$cache" rev-parse refs/heads/main)"
  emergency_audit "$AUDIT_LOG" "resync-to-github" "$main_sha" "ok" "slug=${slug}"
  emergency_log "resync_ok slug=${slug} main=${main_sha}"
}

while IFS=$'\t' read -r slug owner repo; do
  restore_one "$slug" "$owner" "$repo"
done < <(emergency_each_enabled_repo "$EMERGENCY_REPO_LIST")

emergency_write_primary "$EMERGENCY_STATE_DIR" "github"
emergency_audit "$AUDIT_LOG" "resync-to-github" "-" "ok" "primary=github"
emergency_log "primary=github"
emergency_log "production origin was not changed; run restore-github on the server after this push"
