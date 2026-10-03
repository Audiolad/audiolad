#!/usr/bin/env bash
# Plan or invoke the existing on-server rollback.sh. Does not rebuild and
# does not invent a second cutover. Execute mode runs one fixed argv.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

OPERATOR=""
CONFIRM=""
REASON=""
AUDIT_LOG=""
PREVIOUS_COMMIT=""
MODE="plan"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --operator)
      OPERATOR="${2:-}"
      shift 2
      ;;
    --confirm)
      CONFIRM="${2:-}"
      shift 2
      ;;
    --reason)
      REASON="${2:-}"
      shift 2
      ;;
    --audit-log)
      AUDIT_LOG="${2:-}"
      shift 2
      ;;
    --previous-commit)
      PREVIOUS_COMMIT="${2:-}"
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

validate_operator "$OPERATOR"
require_exact_confirm "EMERGENCY_ROLLBACK" "$CONFIRM"
[[ -n "$AUDIT_LOG" ]] || emergency_die "--audit-log is required"
[[ "$REASON" =~ ^[A-Za-z0-9\ .,_:/_-]{1,120}$ ]] || emergency_die "rollback reason contains characters that are not allowed"
validate_sha "$PREVIOUS_COMMIT"

canonical_bin="/var/www/audiolad-deploy/scripts/rollback.sh"
emergency_log "operator=${OPERATOR} previous=${PREVIOUS_COMMIT} mode=${MODE}"
emergency_log "canonical_command=${canonical_bin} ${REASON}"
emergency_log "rollback_reuses_existing_script=yes rebuild=no database_rollback=no"

if [[ "$MODE" == "plan" ]]; then
  append_audit "$AUDIT_LOG" "ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ") operator=${OPERATOR} action=rollback previous=${PREVIOUS_COMMIT} result=planned"
  exit 0
fi

case "${AUDIOLAD_EMERGENCY_EXECUTOR:-}" in
  record)
    [[ -n "${AUDIOLAD_EMERGENCY_RECORD_FILE:-}" ]] || emergency_die "record executor requires AUDIOLAD_EMERGENCY_RECORD_FILE"
    printf '%s\n' "${canonical_bin} ${REASON}" >>"${AUDIOLAD_EMERGENCY_RECORD_FILE}"
    ;;
  ssh)
    [[ "${AUDIOLAD_EMERGENCY_SSH_USER:-}" == "deploy" ]] || emergency_die "SSH user must be deploy"
    [[ "${AUDIOLAD_EMERGENCY_SSH_HOST:-}" =~ ^[A-Za-z0-9.-]+$ ]] || emergency_die "SSH host is not a plain hostname"
    [[ "${AUDIOLAD_EMERGENCY_SSH_PORT:-22}" =~ ^[0-9]+$ ]] || emergency_die "SSH port must be numeric"
    [[ -f "${AUDIOLAD_EMERGENCY_SSH_KEY:-}" && -f "${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS:-}" ]] || emergency_die "SSH key and known_hosts are required"
    ssh \
      -i "${AUDIOLAD_EMERGENCY_SSH_KEY}" \
      -o BatchMode=yes \
      -o IdentitiesOnly=yes \
      -o UserKnownHostsFile="${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS}" \
      -o StrictHostKeyChecking=yes \
      -p "${AUDIOLAD_EMERGENCY_SSH_PORT:-22}" \
      -- \
      "${AUDIOLAD_EMERGENCY_SSH_USER}@${AUDIOLAD_EMERGENCY_SSH_HOST}" \
      sudo -n /var/www/audiolad-deploy/scripts/rollback.sh \
      "${REASON}"
    ;;
  *)
    emergency_die "AUDIOLAD_EMERGENCY_EXECUTOR must be record or ssh"
    ;;
esac

append_audit "$AUDIT_LOG" "ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ") operator=${OPERATOR} action=rollback previous=${PREVIOUS_COMMIT} executor=${AUDIOLAD_EMERGENCY_EXECUTOR} result=invoked_canonical_rollback"
