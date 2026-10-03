#!/usr/bin/env bash
# Emergency deploy preflight. The only production command this script can run
# is the existing canonical wrapper:
#   sudo -n /usr/local/sbin/audiolad-deploy <40-char-sha>
# Policy gates come from deploy/scripts/lib/canonical-deploy-policy.sh.
# This script does not build, cut over, or open a shell on the server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
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

validate_sha "$SHA"
validate_operator "$OPERATOR"
require_exact_confirm "EMERGENCY_DEPLOY" "$CONFIRM"
[[ -d "$GIT_WORKDIR_ARG" ]] || emergency_die "--git-workdir is required"
[[ -n "$AUDIT_LOG" ]] || emergency_die "--audit-log is required"
validate_sha "$PRODUCTION_COMMIT"
[[ "$MODE" == "plan" || "$MODE" == "execute" ]] || emergency_die "mode must be plan or execute"

if [[ "$MODE" == "execute" && -z "$CACHE" ]]; then
  emergency_die "--execute requires --cache and a passing emergency-build-ready check"
fi

export GIT_WORKDIR="$GIT_WORKDIR_ARG"
PREFLIGHT_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$PREFLIGHT_ROOT"
}
trap cleanup EXIT
mkdir -p "$PREFLIGHT_ROOT/releases/active"
printf '%s\n' "$PRODUCTION_COMMIT" >"$PREFLIGHT_ROOT/releases/active/.deploy-commit"
ln -s "$PREFLIGHT_ROOT/releases/active" "$PREFLIGHT_ROOT/current"
export DEPLOY_ROOT="$PREFLIGHT_ROOT"
export CANONICAL_REF="${CANONICAL_REF:-origin/main}"

log_info() { printf '[emergency] [INFO] %s\n' "$*"; }
log_warn() { printf '[emergency] [WARN] %s\n' "$*"; }
log_error() { printf '[emergency] [ERROR] %s\n' "$*" >&2; }

# shellcheck source=../scripts/lib/canonical-deploy-policy.sh
source "$REPO_ROOT/deploy/scripts/lib/canonical-deploy-policy.sh"
if ! run_deploy_policy_gate "$SHA"; then
  append_audit "$AUDIT_LOG" "ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ") operator=${OPERATOR} action=deploy sha=${SHA} result=rejected_by_canonical_policy"
  emergency_die "canonical deploy policy rejected ${SHA}"
fi

check_dir="$(mktemp -d)"
if ! git -C "$GIT_WORKDIR" archive "$SHA" \
  deploy/scripts/deploy.sh \
  deploy/scripts/run-from-target-sha.sh \
  deploy/scripts/github-actions-deploy-wrapper.sh \
  deploy/scripts/lib/canonical-deploy-policy.sh | tar -x -C "$check_dir"; then
  emergency_die "target SHA is missing canonical deploy scripts"
fi
for file in \
  deploy/scripts/deploy.sh \
  deploy/scripts/run-from-target-sha.sh \
  deploy/scripts/github-actions-deploy-wrapper.sh \
  deploy/scripts/lib/canonical-deploy-policy.sh
do
  bash -n "$check_dir/$file"
done
grep -q 'run-from-target-sha.sh' "$check_dir/deploy/scripts/github-actions-deploy-wrapper.sh"
grep -q 'merge-base --is-ancestor' "$check_dir/deploy/scripts/github-actions-deploy-wrapper.sh"
grep -q 'verify_canonical_deploy_candidate' "$check_dir/deploy/scripts/lib/canonical-deploy-policy.sh"
rm -rf "$check_dir"

build_ready="not_checked"
if [[ -n "$CACHE" ]]; then
  ready_args=(--git-workdir "$GIT_WORKDIR" --sha "$SHA" --cache "$CACHE")
  if [[ -n "${AUDIOLAD_EMERGENCY_EXPECT_NODE_MAJOR:-}" ]]; then
    [[ "${AUDIOLAD_EMERGENCY_EXPECT_NODE_MAJOR}" =~ ^[0-9]+$ ]] || emergency_die "node major must be numeric"
    ready_args+=(--expected-node-major "${AUDIOLAD_EMERGENCY_EXPECT_NODE_MAJOR}")
  fi
  if ! node "$ROOT/emergency-build-ready.mjs" "${ready_args[@]}"; then
    append_audit "$AUDIT_LOG" "ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ") operator=${OPERATOR} action=deploy sha=${SHA} result=rejected_build_not_ready"
    emergency_die "commit is not emergency-build-ready"
  fi
  build_ready="ready"
fi

canonical="sudo -n /usr/local/sbin/audiolad-deploy ${SHA}"
emergency_log "operator=${OPERATOR} sha=${SHA} canonical_head=${DEPLOY_CANONICAL_HEAD} production=${PRODUCTION_COMMIT} build_ready=${build_ready} mode=${MODE}"
emergency_log "canonical_command=${canonical}"

if [[ "$MODE" == "plan" ]]; then
  append_audit "$AUDIT_LOG" "ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ") operator=${OPERATOR} action=deploy sha=${SHA} production=${PRODUCTION_COMMIT} canonical_head=${DEPLOY_CANONICAL_HEAD} build_ready=${build_ready} result=planned"
  exit 0
fi

executor="${AUDIOLAD_EMERGENCY_EXECUTOR:-}"
case "$executor" in
  record)
    [[ -n "${AUDIOLAD_EMERGENCY_RECORD_FILE:-}" ]] || emergency_die "record executor requires AUDIOLAD_EMERGENCY_RECORD_FILE"
    printf '%s\n' "$canonical" >>"${AUDIOLAD_EMERGENCY_RECORD_FILE}"
    ;;
  ssh)
    [[ "${AUDIOLAD_EMERGENCY_SSH_USER:-}" == "deploy" ]] || emergency_die "SSH user must be deploy"
    [[ -n "${AUDIOLAD_EMERGENCY_SSH_HOST:-}" ]] || emergency_die "AUDIOLAD_EMERGENCY_SSH_HOST is required"
    [[ "${AUDIOLAD_EMERGENCY_SSH_HOST}" =~ ^[A-Za-z0-9.-]+$ ]] || emergency_die "SSH host is not a plain hostname"
    [[ "${AUDIOLAD_EMERGENCY_SSH_PORT:-22}" =~ ^[0-9]+$ ]] || emergency_die "SSH port must be numeric"
    [[ -f "${AUDIOLAD_EMERGENCY_SSH_KEY:-}" ]] || emergency_die "AUDIOLAD_EMERGENCY_SSH_KEY file is required"
    [[ -f "${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS:-}" ]] || emergency_die "AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS file is required"
    ssh \
      -i "${AUDIOLAD_EMERGENCY_SSH_KEY}" \
      -o BatchMode=yes \
      -o IdentitiesOnly=yes \
      -o UserKnownHostsFile="${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS}" \
      -o StrictHostKeyChecking=yes \
      -p "${AUDIOLAD_EMERGENCY_SSH_PORT:-22}" \
      -- \
      "${AUDIOLAD_EMERGENCY_SSH_USER}@${AUDIOLAD_EMERGENCY_SSH_HOST}" \
      sudo -n /usr/local/sbin/audiolad-deploy \
      "${SHA}"
    ;;
  *)
    emergency_die "AUDIOLAD_EMERGENCY_EXECUTOR must be record or ssh"
    ;;
esac

append_audit "$AUDIT_LOG" "ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ") operator=${OPERATOR} action=deploy sha=${SHA} production=${PRODUCTION_COMMIT} canonical_head=${DEPLOY_CANONICAL_HEAD} build_ready=${build_ready} executor=${executor} result=invoked_canonical_audiolad_deploy"
