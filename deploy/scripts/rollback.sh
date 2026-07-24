#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

REASON="${1:-manual rollback requested}"
ROLLBACK_LOG_FILE="$DEPLOY_LOG_DIR/rollback-$(date -u +"%Y%m%d-%H%M%S").log"
ROLLBACK_CANDIDATE_STARTED=0

exec > >(tee -a "$ROLLBACK_LOG_FILE") 2>&1

usage() {
  cat <<'EOF'
Usage: rollback.sh [reason]

Atomically switch current back to previous without rebuilding.

Zero-downtime order:
  1) ensure previous release listens on a standby loopback port
  2) confirm local readiness + BUILD_ID
  3) Nginx upstream cutover to that port
  4) switch current symlink
  5) public readiness + smoke
  6) only then stop the failed release process
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

probe_port_build_id() {
  local port="$1"
  local expected_build_id="$2"
  local probe_json

  probe_json="$(probe_readiness_once "http://127.0.0.1:${port}" "$expected_build_id" || true)"
  printf '%s' "$probe_json" | node -e 'const input=require("fs").readFileSync(0,"utf8").trim()||"{}";
let payload={};
try { payload=JSON.parse(input); } catch {}
process.exit(payload.ready===true?0:1);'
}

ensure_previous_listening() {
  local previous_dir="$1"
  local target_port="$2"
  local target_app="$3"
  local expected_build_id="$4"

  if port_has_listener "$target_port"; then
    if probe_port_build_id "$target_port" "$expected_build_id"; then
      log_info "Previous release already healthy on port ${target_port}"
      CANDIDATE_PM2_APP="$(detect_pm2_app_on_port "$target_port" "$target_app")"
      CANDIDATE_PORT_ACTIVE="$target_port"
      return 0
    fi

    log_warn "Port ${target_port} is busy with unexpected BUILD_ID; replacing listener for rollback"
    local busy_app
    busy_app="$(pm2_app_for_port "$target_port")"
    stop_pm2_app_safe "$busy_app" "$target_port"
    # Also stop legacy name if it still owns the port somehow.
    if port_has_listener "$target_port"; then
      fuser -k "${target_port}/tcp" >/dev/null 2>&1 || true
      wait_for_port_free "$target_port" 15 1 || {
        log_error "Unable to free rollback target port ${target_port}"
        return 1
      }
    fi
  fi

  if ! start_release_on_port "$previous_dir" "$target_port" "$target_app"; then
    log_error "Failed to start previous release on port ${target_port}"
    return 1
  fi
  ROLLBACK_CANDIDATE_STARTED=1

  if ! wait_for_production_readiness \
    "http://127.0.0.1:${target_port}" \
    "$expected_build_id" \
    40 \
    2 \
    "rollback-candidate:${target_port}"; then
    log_error "Rollback candidate readiness failed on port ${target_port}"
    return 1
  fi
}

on_exit() {
  local status=$?
  if (( status != 0 )) && [[ "$ROLLBACK_CANDIDATE_STARTED" == "1" ]] && [[ "${CUTOVER_COMPLETED:-0}" != "1" ]]; then
    cleanup_failed_candidate
  fi
}

trap on_exit EXIT

main() {
  require_command pm2
  require_command curl
  require_command flock
  require_command sudo
  ensure_dirs
  acquire_deploy_lock

  if [[ ! -L "$DEPLOY_ROOT/previous" ]]; then
    log_error "No previous release symlink found"
    exit 1
  fi

  local previous_dir current_dir expected_build_id
  previous_dir="$(readlink -f "$DEPLOY_ROOT/previous")"
  current_dir="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"

  if [[ ! -d "$previous_dir/.next" ]]; then
    log_error "Previous release is missing .next: $previous_dir"
    exit 1
  fi

  expected_build_id="$(read_build_id "$previous_dir")"
  if [[ "$expected_build_id" == "missing" ]]; then
    log_error "Previous release BUILD_ID missing"
    exit 1
  fi

  log_warn "rollback_started from ${current_dir:-unknown} to $previous_dir"
  log_warn "Reason: $REASON"

  if [[ -n "$current_dir" && -d "$current_dir" ]]; then
    log_info "Current release metadata before rollback:"
    log_rollback_target_metadata "$current_dir"
  fi

  log_info "Previous release metadata (rollback destination):"
  log_rollback_target_metadata "$previous_dir"

  load_runtime_state
  local failed_port="$ACTIVE_PORT"
  local failed_app="$ACTIVE_PM2_APP"
  local target_port="$STANDBY_PORT"
  local target_app
  target_app="$(pm2_app_for_port "$target_port")"

  # Prefer an already-running previous listener (typical right after failed cutover,
  # when the old process was intentionally kept alive on the standby port).
  if ! ensure_previous_listening "$previous_dir" "$target_port" "$target_app" "$expected_build_id"; then
    send_deploy_alert "rollback_failed" "Could not prepare previous release listener for $previous_dir"
    exit 1
  fi

  if ! cutover_nginx_to_port "$target_port"; then
    log_error "cutover_failed during rollback"
    send_deploy_alert "rollback_failed" "Nginx cutover failed during rollback to $previous_dir"
    exit 1
  fi
  CUTOVER_COMPLETED=1

  atomic_symlink "$previous_dir" "$DEPLOY_ROOT/current"
  if [[ -n "$current_dir" && -d "$current_dir" && "$current_dir" != "$previous_dir" ]]; then
    atomic_symlink "$current_dir" "$DEPLOY_ROOT/previous"
  fi

  save_runtime_state "$target_port" "${CANDIDATE_PM2_APP:-$target_app}"
  write_ecosystem_for_active "$previous_dir" "$target_port" "${ACTIVE_PM2_APP}"

  log_info "Waiting for public rollback readiness buildId=${expected_build_id}"
  if ! wait_for_production_readiness "$PUBLIC_BASE_URL" "$expected_build_id" 40 2 "rollback-public"; then
    log_error "Rollback readiness check failed"
    send_deploy_alert "rollback_failed" "Readiness failed after rollback to $previous_dir"
    exit 1
  fi
  log_info "rollback_ready buildId=${expected_build_id} port=${target_port}"

  if ! "$SCRIPT_DIR/smoke-test.sh" "$PUBLIC_BASE_URL"; then
    log_error "Rollback smoke test failed"
    send_deploy_alert "rollback_failed" "Smoke failed after rollback to $previous_dir"
    exit 1
  fi

  if [[ "$failed_app" != "$ACTIVE_PM2_APP" ]]; then
    log_info "Stopping failed release process app=${failed_app} port=${failed_port}"
    stop_pm2_app_safe "$failed_app" "$failed_port"
  fi
  pm2 save

  send_deploy_alert "rollback_success" "Rolled back to $previous_dir. Reason: $REASON"
  log_info "rollback_succeeded target=${previous_dir} buildId=${expected_build_id} port=${ACTIVE_PORT} app=${ACTIVE_PM2_APP}"
  log_info "Rollback completed to $previous_dir"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

main "$@"
