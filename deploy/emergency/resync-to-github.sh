#!/usr/bin/env bash
# Fast-forward emergency primary commits back to GitHub after GitHub returns.
# Never force-pushes. Diverged history fails closed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

EMERGENCY_REPO=""
GITHUB_REPO=""
OPERATOR=""
CONFIRM=""
APPLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --emergency-repo)
      EMERGENCY_REPO="${2:-}"
      shift 2
      ;;
    --github-repo)
      GITHUB_REPO="${2:-}"
      shift 2
      ;;
    --operator)
      OPERATOR="${2:-}"
      shift 2
      ;;
    --confirm)
      CONFIRM="${2:-}"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    *)
      emergency_die "unknown argument: $1"
      ;;
  esac
done

[[ -d "$EMERGENCY_REPO" && -d "$GITHUB_REPO" ]] || emergency_die "local emergency and github repos are required"
validate_operator "$OPERATOR"
require_exact_confirm "RESYNC_TO_GITHUB" "$CONFIRM"
validate_remote_url "$GITHUB_REPO"

emergency_sha="$(git -C "$EMERGENCY_REPO" rev-parse --verify refs/heads/main)"
github_sha="$(git -C "$GITHUB_REPO" rev-parse --verify refs/heads/main)"
validate_sha "$emergency_sha"
validate_sha "$github_sha"

if [[ "$emergency_sha" == "$github_sha" ]]; then
  emergency_log "status=already_in_sync sha=${emergency_sha} operator=${OPERATOR}"
  exit 0
fi

if git -C "$EMERGENCY_REPO" merge-base --is-ancestor "$emergency_sha" "$github_sha"; then
  emergency_die "GitHub main is ahead of the emergency primary. Fetch GitHub into the emergency repo before resync. Refusing to rewind emergency main."
fi

if ! git -C "$EMERGENCY_REPO" merge-base --is-ancestor "$github_sha" "$emergency_sha"; then
  emergency_die "emergency main and GitHub main have diverged. Refusing to force-push. Reconcile the histories first."
fi

emergency_log "status=fast_forward github=${github_sha} emergency=${emergency_sha} operator=${OPERATOR} apply=${APPLY}"
if [[ "$APPLY" != "1" ]]; then
  emergency_log "dry_run=yes command=git push github refs/heads/main:refs/heads/main"
  exit 0
fi

git -C "$EMERGENCY_REPO" push "$GITHUB_REPO" refs/heads/main:refs/heads/main
emergency_log "status=pushed sha=${emergency_sha}"
