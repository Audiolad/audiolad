#!/usr/bin/env bash
# Emergency deploy preflight and optional execution.
# Execution SSHes exactly one canonical command:
#   sudo -n /usr/local/sbin/audiolad-deploy <sha>
# plus a read-only post-check of current/.deploy-commit.
# It does not run deploy.sh itself and does not accept a remote shell string.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

usage() {
  cat <<'EOF'
Usage: emergency-deploy.sh preflight <40-char-sha>
       emergency-deploy.sh execute <40-char-sha>

preflight checks the commit locally and writes an audit line.
execute does the same checks, then requires:
  AUDIOLAD_EMERGENCY_DEPLOY_EXECUTE=1
  PRODUCTION_SSH_HOST PRODUCTION_SSH_PORT PRODUCTION_SSH_USER
  PRODUCTION_SSH_KEY_FILE PRODUCTION_SSH_KNOWN_HOSTS_FILE
and runs only sudo -n /usr/local/sbin/audiolad-deploy <sha>.

Required for both:
  EMERGENCY_GIT_DIR
  ACTIVE_PRODUCTION_SHA     40 lowercase hex
  EMERGENCY_PRIMARY_REF     default refs/heads/main

Optional:
  EMERGENCY_AUDIT_LOG
  EMERGENCY_SSH_BIN         default ssh (tests may substitute a fake)
  EMERGENCY_SKIP_SERVER_GIT_STATUS=1
      skip the fixed origin_role=mirror status command (tests only)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 2 ]]; then
  emergency_die "usage: emergency-deploy.sh preflight|execute <sha>"
fi
MODE="$1"
SHA="$2"
case "$MODE" in
  preflight|execute) ;;
  *) emergency_die "mode must be preflight or execute" ;;
esac
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || emergency_die "SHA must be 40 lowercase hex"

if [[ -n "${AUDIOLAD_DEPLOY_OVERRIDE:-}" || -n "${AUDIOLAD_DEPLOY_OVERRIDE_REASON:-}" ]]; then
  emergency_die "refusing to run with AUDIOLAD_DEPLOY_OVERRIDE set"
fi

: "${EMERGENCY_GIT_DIR:?EMERGENCY_GIT_DIR is required}"
: "${ACTIVE_PRODUCTION_SHA:?ACTIVE_PRODUCTION_SHA is required}"
[[ "$ACTIVE_PRODUCTION_SHA" =~ ^[0-9a-f]{40}$ ]] || emergency_die "ACTIVE_PRODUCTION_SHA must be 40 lowercase hex"
EMERGENCY_PRIMARY_REF="${EMERGENCY_PRIMARY_REF:-refs/heads/main}"
case "$EMERGENCY_PRIMARY_REF" in
  refs/heads/*) ;;
  *) emergency_die "EMERGENCY_PRIMARY_REF must be refs/heads/..." ;;
esac
AUDIT_LOG="${EMERGENCY_AUDIT_LOG:-${EMERGENCY_STATE_DIR:-/tmp}/emergency-deploy-audit.log}"
if [[ "$AUDIT_LOG" == "/tmp/emergency-deploy-audit.log" ]]; then
  AUDIT_LOG="$(mktemp /tmp/audiolad-emergency-audit.XXXXXX)"
  emergency_log "audit_log=${AUDIT_LOG}"
fi

git -C "$EMERGENCY_GIT_DIR" cat-file -e "${SHA}^{commit}" || emergency_die "SHA is not a commit in EMERGENCY_GIT_DIR"
git -C "$EMERGENCY_GIT_DIR" cat-file -e "${ACTIVE_PRODUCTION_SHA}^{commit}" \
  || emergency_die "active production commit is not in EMERGENCY_GIT_DIR"
if ! git -C "$EMERGENCY_GIT_DIR" merge-base --is-ancestor "$SHA" "$EMERGENCY_PRIMARY_REF"; then
  emergency_audit "$AUDIT_LOG" "deploy-${MODE}" "$SHA" "refused" "not reachable from ${EMERGENCY_PRIMARY_REF}"
  emergency_die "${SHA} is not reachable from ${EMERGENCY_PRIMARY_REF}"
fi
if ! git -C "$EMERGENCY_GIT_DIR" merge-base --is-ancestor "$ACTIVE_PRODUCTION_SHA" "$SHA"; then
  emergency_audit "$AUDIT_LOG" "deploy-${MODE}" "$SHA" "refused" "does not contain production ${ACTIVE_PRODUCTION_SHA}"
  emergency_die "${SHA} does not contain active production commit ${ACTIVE_PRODUCTION_SHA}"
fi

"$SCRIPT_DIR/pre-deploy-checks.sh" "$EMERGENCY_GIT_DIR" "$SHA" >/dev/null
emergency_audit "$AUDIT_LOG" "deploy-${MODE}" "$SHA" "preflight-ok" "production=${ACTIVE_PRODUCTION_SHA}"
emergency_log "preflight_ok sha=${SHA} production=${ACTIVE_PRODUCTION_SHA}"

if [[ "$MODE" == "preflight" ]]; then
  printf 'canonical_command=sudo -n /usr/local/sbin/audiolad-deploy %s\n' "$SHA"
  exit 0
fi

if [[ "${AUDIOLAD_EMERGENCY_DEPLOY_EXECUTE:-}" != "1" ]]; then
  emergency_die "execute refused: set AUDIOLAD_EMERGENCY_DEPLOY_EXECUTE=1"
fi

: "${PRODUCTION_SSH_HOST:?PRODUCTION_SSH_HOST is required}"
: "${PRODUCTION_SSH_PORT:?PRODUCTION_SSH_PORT is required}"
: "${PRODUCTION_SSH_USER:?PRODUCTION_SSH_USER is required}"
: "${PRODUCTION_SSH_KEY_FILE:?PRODUCTION_SSH_KEY_FILE is required}"
: "${PRODUCTION_SSH_KNOWN_HOSTS_FILE:?PRODUCTION_SSH_KNOWN_HOSTS_FILE is required}"
[[ "$PRODUCTION_SSH_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || emergency_die "SSH host is not a plain host"
[[ "$PRODUCTION_SSH_PORT" =~ ^[0-9]+$ ]] || emergency_die "SSH port is not numeric"
[[ "$PRODUCTION_SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || emergency_die "SSH user is not a plain username"
[[ -f "$PRODUCTION_SSH_KEY_FILE" ]] || emergency_die "SSH key file missing"
[[ -f "$PRODUCTION_SSH_KNOWN_HOSTS_FILE" ]] || emergency_die "known_hosts file missing"

SSH_BIN="${EMERGENCY_SSH_BIN:-ssh}"
ssh_base=(
  "$SSH_BIN"
  -i "$PRODUCTION_SSH_KEY_FILE"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="$PRODUCTION_SSH_KNOWN_HOSTS_FILE"
  -p "$PRODUCTION_SSH_PORT"
  --
  "${PRODUCTION_SSH_USER}@${PRODUCTION_SSH_HOST}"
)

if [[ "${EMERGENCY_SKIP_SERVER_GIT_STATUS:-}" != "1" ]]; then
  status_out="$("${ssh_base[@]}" sudo -n /usr/local/sbin/audiolad-emergency-git-source status)"
  if ! printf '%s\n' "$status_out" | grep -q '^origin_role=mirror$'; then
    emergency_audit "$AUDIT_LOG" "deploy-execute" "$SHA" "refused" "server origin_role is not mirror"
    emergency_die "server git origin is not the emergency mirror. Run activate-mirror first."
  fi
fi

"${ssh_base[@]}" sudo -n /usr/local/sbin/audiolad-deploy "$SHA"
remote_commit="$("${ssh_base[@]}" cat /var/www/audiolad-deploy/current/.deploy-commit | tr -d '[:space:]')"
if [[ "$remote_commit" != "$SHA" ]]; then
  emergency_audit "$AUDIT_LOG" "deploy-execute" "$SHA" "failed" "post-check ${remote_commit}"
  emergency_die "post-check failed: current/.deploy-commit=${remote_commit}"
fi
emergency_audit "$AUDIT_LOG" "deploy-execute" "$SHA" "ok" "canonical audiolad-deploy"
emergency_log "execute_ok sha=${SHA}"
