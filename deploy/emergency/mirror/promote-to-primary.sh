#!/usr/bin/env bash
# Record that the emergency mirror is now the writable Git primary.
# Does not force-push, does not change production origin, does not deploy.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

usage() {
  cat <<'EOF'
Usage: promote-to-primary.sh PROMOTE_MIRROR_TO_PRIMARY

Requires the exact confirm token. Checks each enabled repo's mirror tip
still contains the last successful sync commit, then records primary=gitea.

After this, sync-from-github.sh refuses to run, so a later GitHub recovery
cannot erase commits that landed only on the mirror.

Does not SSH to production. Switching the production object-store origin
is a separate fixed command: audiolad-emergency-git-source activate-mirror.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ "${1:-}" != "PROMOTE_MIRROR_TO_PRIMARY" || $# -ne 1 ]]; then
  emergency_die "refusing promotion without exact confirm token PROMOTE_MIRROR_TO_PRIMARY"
fi

: "${EMERGENCY_MIRROR_ROOT:?EMERGENCY_MIRROR_ROOT is required}"
: "${EMERGENCY_STATE_DIR:?EMERGENCY_STATE_DIR is required}"
: "${EMERGENCY_MIRROR_BASE:?EMERGENCY_MIRROR_BASE is required}"
EMERGENCY_REPO_LIST="${EMERGENCY_REPO_LIST:-$SCRIPT_DIR/../repos.list}"
AUDIT_LOG="${EMERGENCY_AUDIT_LOG:-$EMERGENCY_STATE_DIR/audit.log}"
export GIT_TERMINAL_PROMPT=0
trap emergency_clear_askpass EXIT

primary="$(emergency_read_primary "$EMERGENCY_STATE_DIR")"
if [[ "$primary" == "gitea" ]]; then
  emergency_log "already_primary=gitea"
  exit 0
fi
if [[ "$primary" != "github" ]]; then
  emergency_die "refusing promotion from primary=${primary}"
fi

checked=0
while IFS=$'\t' read -r slug owner repo; do
  safe="${slug//\//__}"
  manifest="${EMERGENCY_STATE_DIR}/manifests/${safe}"
  [[ -f "$manifest" ]] || emergency_die "no sync manifest for ${slug}; run sync-from-github.sh first"
  manifest_sha="$(sed -n 's/^main=//p' "$manifest" | tr -d '[:space:]')"
  [[ "$manifest_sha" =~ ^[0-9a-f]{40}$ ]] || emergency_die "manifest main SHA missing for ${slug}"
  dest_url="$(emergency_join_url "$EMERGENCY_MIRROR_BASE" "${owner}/${repo}.git")"
  emergency_validate_mirror_url "$dest_url"
  cache="$(emergency_cache_dir_for_slug "$EMERGENCY_MIRROR_ROOT" "$slug")"
  [[ -d "$cache" ]] || emergency_die "mirror cache missing for ${slug}"
  emergency_git git -C "$cache" fetch --prune "$dest_url" '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*'
  if ! git -C "$cache" cat-file -e "${manifest_sha}^{commit}"; then
    emergency_die "manifest commit ${manifest_sha} is not in the mirror cache"
  fi
  tip="$(git -C "$cache" rev-parse refs/heads/main)"
  if ! git -C "$cache" merge-base --is-ancestor "$manifest_sha" "$tip"; then
    emergency_die "mirror main ${tip} does not contain last sync commit ${manifest_sha}"
  fi
  emergency_log "promote_ok slug=${slug} main=${tip}"
  checked=$((checked + 1))
done < <(emergency_each_enabled_repo "$EMERGENCY_REPO_LIST")

if [[ "$checked" -lt 1 ]]; then
  emergency_die "repo list has no enabled repositories"
fi

emergency_write_primary "$EMERGENCY_STATE_DIR" "gitea"
emergency_audit "$AUDIT_LOG" "promote-to-primary" "-" "ok" "repos=${checked}"
emergency_log "primary=gitea repos=${checked}"
emergency_log "production origin was not changed"
