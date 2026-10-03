#!/usr/bin/env bash
# Point a git workdir's origin at the emergency mirror, or back at GitHub.
# Refuses the production checkout unless an explicit production override is set.
# This script does not deploy and does not change DNS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

GIT_WORKDIR_ARG=""
ORIGIN_URL=""
OPERATOR=""
CONFIRM=""
APPLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --git-workdir)
      GIT_WORKDIR_ARG="${2:-}"
      shift 2
      ;;
    --origin-url)
      ORIGIN_URL="${2:-}"
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

[[ -d "$GIT_WORKDIR_ARG" ]] || emergency_die "--git-workdir is required"
validate_operator "$OPERATOR"
validate_remote_url "$ORIGIN_URL"
[[ "$CONFIRM" == "RETARGET_ORIGIN_TO_EMERGENCY" || "$CONFIRM" == "RETARGET_ORIGIN_TO_GITHUB" ]] || \
  emergency_die "confirmation must be RETARGET_ORIGIN_TO_EMERGENCY or RETARGET_ORIGIN_TO_GITHUB"

resolved="$(cd "$GIT_WORKDIR_ARG" && pwd -P)"
case "$resolved" in
  /var/www/audiolad|/var/www/audiolad/*|/var/www/audiolad-clean|/var/www/audiolad-clean/*|/var/www/audiolad-deploy|/var/www/audiolad-deploy/*)
    if [[ "${AUDIOLAD_EMERGENCY_ALLOW_PRODUCTION_PATH:-}" != "1" ]]; then
      emergency_die "refusing to retarget a production git path without AUDIOLAD_EMERGENCY_ALLOW_PRODUCTION_PATH=1"
    fi
    ;;
esac

if [[ "$CONFIRM" == "RETARGET_ORIGIN_TO_EMERGENCY" ]]; then
  refuse_github_target "$ORIGIN_URL"
else
  lower="${ORIGIN_URL,,}"
  [[ "$lower" == *"github.com"* ]] || emergency_die "GitHub retarget URL must point at github.com"
fi

current="$(git -C "$resolved" remote get-url origin 2>/dev/null || true)"
emergency_log "operator=${OPERATOR} workdir=${resolved} apply=${APPLY}"
emergency_log "current_origin=$(printf '%s' "$current" | redact_text)"
emergency_log "next_origin=$(printf '%s' "$ORIGIN_URL" | redact_text)"
if [[ "$APPLY" != "1" ]]; then
  emergency_log "dry_run=yes"
  exit 0
fi

if git -C "$resolved" remote get-url origin >/dev/null 2>&1; then
  git -C "$resolved" remote set-url origin "$ORIGIN_URL"
else
  git -C "$resolved" remote add origin "$ORIGIN_URL"
fi
git -C "$resolved" fetch origin main
emergency_log "status=origin_retargeted fetched=origin/main sha=$(git -C "$resolved" rev-parse refs/remotes/origin/main)"
