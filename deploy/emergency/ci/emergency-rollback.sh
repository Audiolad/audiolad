#!/usr/bin/env bash
# Records an audit line and optionally runs the fixed rollback wrapper.
# Remote command is only: sudo -n /usr/local/sbin/audiolad-rollback
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$SCRIPT_DIR/../lib/common.sh"

usage() {
  cat <<'EOF'
Usage: emergency-rollback.sh preflight
       emergency-rollback.sh execute

execute requires AUDIOLAD_EMERGENCY_ROLLBACK_EXECUTE=1 and the same SSH
files as emergency-deploy.sh. No reason string is sent to the server.
The wrapper calls the current release's canonical rollback.sh.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 ]]; then
  emergency_die "usage: emergency-rollback.sh preflight|execute"
fi
MODE="$1"
case "$MODE" in
  preflight|execute) ;;
  *) emergency_die "mode must be preflight or execute" ;;
esac
AUDIT_LOG="${EMERGENCY_AUDIT_LOG:-/tmp/audiolad-emergency-rollback-audit.log}"
emergency_audit "$AUDIT_LOG" "rollback-${MODE}" "-" "requested" "canonical audiolad-rollback"
emergency_log "rollback_${MODE}"

if [[ "$MODE" == "preflight" ]]; then
  printf 'canonical_command=sudo -n /usr/local/sbin/audiolad-rollback\n'
  exit 0
fi
if [[ "${AUDIOLAD_EMERGENCY_ROLLBACK_EXECUTE:-}" != "1" ]]; then
  emergency_die "execute refused: set AUDIOLAD_EMERGENCY_ROLLBACK_EXECUTE=1"
fi
: "${PRODUCTION_SSH_HOST:?}"
: "${PRODUCTION_SSH_PORT:?}"
: "${PRODUCTION_SSH_USER:?}"
: "${PRODUCTION_SSH_KEY_FILE:?}"
: "${PRODUCTION_SSH_KNOWN_HOSTS_FILE:?}"
[[ "$PRODUCTION_SSH_HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || emergency_die "SSH host is not a plain host"
[[ "$PRODUCTION_SSH_PORT" =~ ^[0-9]+$ ]] || emergency_die "SSH port is not numeric"
[[ "$PRODUCTION_SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || emergency_die "SSH user is not a plain username"
SSH_BIN="${EMERGENCY_SSH_BIN:-ssh}"
"$SSH_BIN" \
  -i "$PRODUCTION_SSH_KEY_FILE" \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$PRODUCTION_SSH_KNOWN_HOSTS_FILE" \
  -p "$PRODUCTION_SSH_PORT" \
  -- \
  "${PRODUCTION_SSH_USER}@${PRODUCTION_SSH_HOST}" \
  sudo -n /usr/local/sbin/audiolad-rollback
emergency_audit "$AUDIT_LOG" "rollback-execute" "-" "ok" "canonical audiolad-rollback"
