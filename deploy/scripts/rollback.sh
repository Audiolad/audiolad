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

log_rollback_target_metadata() {
  local release_dir="$1"
  local deploy_commit build_id

  if [[ -f "$release_dir/.deploy-commit" ]]; then
    deploy_commit="$(tr -d '\n' < "$release_dir/.deploy-commit")"
    log_info "Rollback target deploy commit: $deploy_commit"
  else
    deploy_commit=""
    log_warn "Rollback target missing .deploy-commit: $release_dir"
  fi

  if [[ -f "$release_dir/.deploy-metadata" ]]; then
    log_info "Rollback target metadata:"
    while IFS= read -r line; do
      [[ -n "$line" ]] && log_info "  $line"
    done < "$release_dir/.deploy-metadata"
  fi

  build_id="$(read_build_id "$release_dir")"
  log_info "Rollback target BUILD_ID: $build_id"

  if [[ -n "$deploy_commit" ]] && command -v git >/dev/null 2>&1; then
    if git -C "$GIT_WORKDIR" fetch origin main 2>/dev/null; then
      if git -C "$GIT_WORKDIR" merge-base --is-ancestor "$deploy_commit" origin/main 2>/dev/null; then
        log_info "Rollback target commit is reachable from origin/main (canonical)"
      else
        log_warn "Rollback target commit is NOT reachable from origin/main (non-canonical or predates sync)"
      fi
    else
      log_warn "Could not fetch origin/main; skipping canonical check for rollback target"
    fi
  fi
}

main() {
  require_command pm2
  require_command curl
  require_command flock
  ensure_dirs
  acquire_deploy_lock

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

  if [[ -n "$current_dir" && -d "$current_dir" ]]; then
    log_info "Current release metadata before rollback:"
    log_rollback_target_metadata "$current_dir"
  fi

  log_info "Previous release metadata (rollback destination):"
  log_rollback_target_metadata "$previous_dir"

  atomic_symlink "$previous_dir" "$DEPLOY_ROOT/current"

  if ! sync_pm2_audiolad; then
    log_error "Failed to sync PM2 during rollback"
    send_deploy_alert "rollback_failed" "PM2 sync failed during rollback to $previous_dir"
    exit 1
  fi

  if ! wait_for_release_readiness "$previous_dir"; then
    log_error "Rollback readiness check failed"
    send_deploy_alert "rollback_failed" "Readiness failed after rollback to $previous_dir"
    exit 1
  fi

  if ! "$SCRIPT_DIR/smoke-test.sh" "$PUBLIC_BASE_URL"; then
    log_error "Rollback smoke test failed"
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
