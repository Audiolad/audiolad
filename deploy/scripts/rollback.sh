#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

REASON="${1:-manual rollback requested}"
ROLLBACK_LOG_FILE="$DEPLOY_LOG_DIR/rollback-$(date -u +"%Y%m%d-%H%M%S").log"

exec > >(tee -a "$ROLLBACK_LOG_FILE") 2>&1

usage() {
  cat <<'EOF'
Usage: rollback.sh [reason]

Atomically switch current back to previous without rebuilding.
EOF
}

main() {
  require_command pm2
  require_command curl
  ensure_dirs

  if [[ ! -L "$DEPLOY_ROOT/previous" ]]; then
    log_error "No previous release symlink found"
    exit 1
  fi

  local previous_dir current_dir
  previous_dir="$(readlink -f "$DEPLOY_ROOT/previous")"
  current_dir="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"

  if [[ ! -d "$previous_dir/.next" ]]; then
    log_error "Previous release is missing .next: $previous_dir"
    exit 1
  fi

  log_warn "Rolling back from ${current_dir:-unknown} to $previous_dir"
  log_warn "Reason: $REASON"

  atomic_symlink "$previous_dir" "$DEPLOY_ROOT/current"

  if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    pm2 startOrReload "$DEPLOY_ROOT/ecosystem.config.cjs" --only "$PM2_APP_NAME" --update-env
  else
    pm2 start "$DEPLOY_ROOT/ecosystem.config.cjs" --only "$PM2_APP_NAME"
  fi
  pm2 save

  if ! wait_for_health "http://127.0.0.1:${PRODUCTION_PORT}" 40 2; then
    log_error "Rollback health check failed"
    send_deploy_alert "rollback_failed" "Health failed after rollback to $previous_dir"
    exit 1
  fi

  if ! "$SCRIPT_DIR/smoke-test.sh" "https://audiolad.ru"; then
    log_error "Rollback HTTP smoke test failed"
    send_deploy_alert "rollback_failed" "Smoke failed after rollback to $previous_dir"
    exit 1
  fi

  send_deploy_alert "rollback_success" "Rolled back to $previous_dir. Reason: $REASON"
  log_info "Rollback completed to $previous_dir"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

main "$@"
