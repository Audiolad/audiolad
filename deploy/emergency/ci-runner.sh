#!/usr/bin/env bash
# Independent CI entrypoint. Runs fixed checks, then the canonical deploy
# preflight. GitHub Actions is not required at execution time.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

SHA=""
OPERATOR=""
CONFIRM=""
GIT_WORKDIR_ARG=""
PRODUCTION_COMMIT=""
AUDIT_LOG=""
CACHE=""
MODE="plan"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha)
      SHA="${2:-}"
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
    --git-workdir)
      GIT_WORKDIR_ARG="${2:-}"
      shift 2
      ;;
    --production-commit)
      PRODUCTION_COMMIT="${2:-}"
      shift 2
      ;;
    --audit-log)
      AUDIT_LOG="${2:-}"
      shift 2
      ;;
    --cache)
      CACHE="${2:-}"
      shift 2
      ;;
    --plan)
      MODE="plan"
      shift
      ;;
    --execute)
      MODE="execute"
      shift
      ;;
    *)
      emergency_die "unknown argument: $1"
      ;;
  esac
done

require_exact_confirm "EMERGENCY_CI" "$CONFIRM"
bash "$ROOT/repository-checks.sh"

args=(
  --sha "$SHA"
  --operator "$OPERATOR"
  --confirm EMERGENCY_DEPLOY
  --git-workdir "$GIT_WORKDIR_ARG"
  --production-commit "$PRODUCTION_COMMIT"
  --audit-log "$AUDIT_LOG"
)
if [[ -n "$CACHE" ]]; then
  args+=(--cache "$CACHE")
fi
if [[ "$MODE" == "execute" ]]; then
  args+=(--execute)
else
  args+=(--plan)
fi
bash "$ROOT/emergency-deploy.sh" "${args[@]}"
