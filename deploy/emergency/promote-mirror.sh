#!/usr/bin/env bash
# Mark a mirrored repo as the writable emergency primary.
# Stops mirror-sync.sh from force-updating its branches.
# Optional Gitea API call clears the pull-mirror flag when one was set.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

WORK_DIR=""
REPO=""
OPERATOR=""
CONFIRM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --work-dir)
      WORK_DIR="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
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
    *)
      emergency_die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$WORK_DIR" && -d "$WORK_DIR" ]] || emergency_die "--work-dir is required"
[[ "$REPO" =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] || emergency_die "--repo must be a plain name"
validate_operator "$OPERATOR"
require_exact_confirm "PROMOTE_MIRROR" "$CONFIRM"

mode_file="$WORK_DIR/state/${REPO}.mode"
mkdir -p "$WORK_DIR/state"
if [[ -f "$mode_file" ]] && [[ "$(tr -d '[:space:]' <"$mode_file")" == "primary" ]]; then
  emergency_log "repo=${REPO} status=already_primary"
else
  printf 'primary\n' >"$mode_file"
fi
printf 'promoted_at=%s\npromoted_by=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$OPERATOR" >"$WORK_DIR/state/${REPO}.promotion"

if [[ -n "${AUDIOLAD_GITEA_API_URL:-}" ]]; then
  [[ -n "${AUDIOLAD_EMERGENCY_GIT_TOKEN:-}" ]] || emergency_die "Gitea promotion requires AUDIOLAD_EMERGENCY_GIT_TOKEN"
  [[ "${AUDIOLAD_GITEA_OWNER:-}" =~ ^[A-Za-z0-9._-]{1,40}$ ]] || emergency_die "AUDIOLAD_GITEA_OWNER is required with AUDIOLAD_GITEA_API_URL"
  validate_remote_url "${AUDIOLAD_GITEA_API_URL}"
  api="${AUDIOLAD_GITEA_API_URL%/}/api/v1/repos/${AUDIOLAD_GITEA_OWNER}/${REPO}"
  curl --fail-with-body -sS -o "$WORK_DIR/state/${REPO}.gitea-promote.json" \
    -X PATCH \
    -H "Authorization: token ${AUDIOLAD_EMERGENCY_GIT_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"mirror":false}' \
    "$api"
  python3 - "$WORK_DIR/state/${REPO}.gitea-promote.json" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
if payload.get("mirror") not in (False, None):
    raise SystemExit("Gitea repo is still marked mirror")
PY
fi

emergency_log "repo=${REPO} status=promoted operator=${OPERATOR}"
