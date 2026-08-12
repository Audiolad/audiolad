#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/canonical-deploy-policy.sh
source "$SCRIPT_DIR/lib/canonical-deploy-policy.sh"

usage() {
  cat <<'EOF'
Usage: deploy.sh <commit-sha>

Safely deploy a new release without rebuilding inside the active current directory.
Deploy commit SHA is required. Only commits reachable from origin/main are allowed
unless AUDIOLAD_DEPLOY_OVERRIDE=1 with AUDIOLAD_DEPLOY_OVERRIDE_REASON set.

Release content is extracted via git archive from the commit object only;
dirty working tree files are never included.

Zero-downtime cutover:
  1) build candidate release
  2) start candidate on standby loopback port
  3) local readiness (BUILD_ID) + candidate smoke
  4) switch current/previous symlinks (Nginx still on old port)
  5) Nginx upstream cutover to candidate
  6) public readiness + smoke + health-watch
  7) stop previous process only after success
EOF
}

COMMIT_REF="${1:-}"
DEPLOY_LOG_FILE="$DEPLOY_LOG_DIR/deploy-$(date -u +"%Y%m%d-%H%M%S").log"
OLD_ACTIVE_PORT=""
OLD_ACTIVE_PM2_APP=""
EXPECTED_BUILD_ID=""

exec > >(tee -a "$DEPLOY_LOG_FILE") 2>&1

on_exit() {
  local status=$?
  if (( status != 0 )); then
    cleanup_failed_candidate
  fi
}

trap on_exit EXIT

main() {
  require_command git
  require_command npm
  require_command curl
  require_command node
  require_command flock
  require_command pm2
  require_command sudo

  local arg_status=0
  validate_deploy_commit_argument "$@" || arg_status=$?
  if (( arg_status == 2 )); then
    usage
    exit 0
  fi
  if (( arg_status != 0 )); then
    usage
    exit 1
  fi

  ensure_dirs
  acquire_deploy_lock
  # Retention/cleanup runs only after successful health-watch (never mid-deploy).
  check_disk_space 2048

  if [[ ! -f "$DEPLOY_ROOT/shared/.env.production" ]]; then
    log_error "Missing $DEPLOY_ROOT/shared/.env.production"
    exit 1
  fi

  if ! run_deploy_policy_gate "$COMMIT_REF"; then
    log_error "Deploy policy gate rejected commit $COMMIT_REF"
    exit 1
  fi

  load_runtime_state
  OLD_ACTIVE_PORT="$ACTIVE_PORT"
  OLD_ACTIVE_PM2_APP="$ACTIVE_PM2_APP"

  if ! ensure_nginx_upstream_bootstrap "$ACTIVE_PORT"; then
    log_error "Nginx upstream bootstrap failed"
    exit 1
  fi

  local FULL_COMMIT="$DEPLOY_FULL_COMMIT"
  RELEASE_NAME="$(get_release_name "$FULL_COMMIT")"
  RELEASE_DIR="$DEPLOY_ROOT/releases/$RELEASE_NAME"
  export CANDIDATE_RELEASE_DIR="$RELEASE_DIR"
  local candidate_port="$STANDBY_PORT"
  local candidate_app
  candidate_app="$(pm2_app_for_port "$candidate_port")"

  if [[ -e "$RELEASE_DIR" ]]; then
    log_error "Release directory already exists: $RELEASE_DIR"
    exit 1
  fi

  log_info "candidate_build_started release=${RELEASE_NAME} commit=${FULL_COMMIT}"
  log_info "Creating release $RELEASE_NAME from commit $FULL_COMMIT"
  mkdir -p "$RELEASE_DIR"
  # Protect in-flight candidate from any retention/cleanup until deploy finishes.
  printf 'started_at=%s\ncommit=%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$FULL_COMMIT" \
    >"$RELEASE_DIR/.deploy-inflight"

  git -C "$GIT_WORKDIR" archive "$FULL_COMMIT" | tar -x -C "$RELEASE_DIR"
  ln -sfn "$DEPLOY_ROOT/shared/.env.production" "$RELEASE_DIR/.env.local"
  ln -sfn "$DEPLOY_ROOT/shared/.env.production" "$RELEASE_DIR/.env.production"

  cd "$RELEASE_DIR"
  npm ci
  npm run lint
  npm run build

  if [[ ! -f "$RELEASE_DIR/.next/BUILD_ID" ]]; then
    log_error "Build failed: .next/BUILD_ID missing stage=after_build path=$RELEASE_DIR/.next/BUILD_ID"
    exit 1
  fi

  EXPECTED_BUILD_ID="$(read_build_id "$RELEASE_DIR")"
  log_info "candidate_build_passed release=${RELEASE_NAME} buildId=${EXPECTED_BUILD_ID}"
  publish_next_static_overlay "$RELEASE_DIR"
  log_info "Active production remains on port ${OLD_ACTIVE_PORT} app=${OLD_ACTIVE_PM2_APP}"
  # Leave release tree before any destructive cleanup/rollback paths.
  cd "$DEPLOY_ROOT"

  if ! start_release_on_port "$RELEASE_DIR" "$candidate_port" "$candidate_app"; then
    log_error "Failed to start candidate process"
    send_deploy_alert "deploy_failed" "Candidate process start failed for $RELEASE_NAME"
    exit 1
  fi

  log_info "Waiting for candidate readiness on 127.0.0.1:${candidate_port}"
  if ! wait_for_production_readiness \
    "http://127.0.0.1:${candidate_port}" \
    "$EXPECTED_BUILD_ID" \
    40 \
    2 \
    "candidate:${candidate_port}"; then
    log_error "candidate_readiness_failed release=${RELEASE_NAME}"
    send_deploy_alert "deploy_failed" "Candidate health check failed for $RELEASE_NAME"
    exit 1
  fi
  log_info "candidate_ready release=${RELEASE_NAME} port=${candidate_port} buildId=${EXPECTED_BUILD_ID}"

  log_info "Running smoke tests against candidate"
  if ! "$SCRIPT_DIR/smoke-test.sh" "http://127.0.0.1:${candidate_port}"; then
    log_error "Candidate smoke tests failed"
    send_deploy_alert "deploy_failed" "Candidate smoke tests failed for $RELEASE_NAME"
    exit 1
  fi

  if [[ ! -f "$RELEASE_DIR/.next/BUILD_ID" ]]; then
    log_error "BUILD_ID missing before cutover stage=pre_cutover path=$RELEASE_DIR/.next/BUILD_ID"
    exit 1
  fi
  if [[ "$(read_build_id "$RELEASE_DIR")" != "$EXPECTED_BUILD_ID" ]]; then
    log_error "BUILD_ID changed before cutover stage=pre_cutover"
    exit 1
  fi

  local old_current=""
  if [[ -L "$DEPLOY_ROOT/current" ]]; then
    old_current="$(readlink -f "$DEPLOY_ROOT/current")"
    atomic_symlink "$old_current" "$DEPLOY_ROOT/previous"
    log_info "Previous release set to $old_current"
  fi

  atomic_symlink "$RELEASE_DIR" "$DEPLOY_ROOT/current"
  log_info "Current release symlink switched to $RELEASE_DIR (Nginx still on port ${OLD_ACTIVE_PORT})"

  if [[ ! -f "$DEPLOY_ROOT/current/.next/BUILD_ID" ]]; then
    log_error "BUILD_ID missing immediately after symlink cutover stage=post_cutover_symlink"
    if [[ -n "$old_current" && -d "$old_current" ]]; then
      atomic_symlink "$old_current" "$DEPLOY_ROOT/current"
      log_warn "Restored current symlink after BUILD_ID loss at post_cutover_symlink"
    fi
    exit 1
  fi

  printf '%s\n' "$FULL_COMMIT" > "$RELEASE_DIR/.deploy-commit"
  write_deploy_metadata \
    "$RELEASE_DIR" \
    "$FULL_COMMIT" \
    "$DEPLOY_CANONICAL_HEAD" \
    "$DEPLOY_OVERRIDE_FLAG" \
    "$DEPLOY_OVERRIDE_REASON"
  log_info "Capturing PM2 baseline of active production before cutover"
  if ! pm2 jlist 2>/dev/null | node "$SCRIPT_DIR/lib/pm2-health.mjs" snapshot --app "$OLD_ACTIVE_PM2_APP" >"$RELEASE_DIR/.pm2-health-baseline.json"; then
    # First migration may still use legacy name while port apps exist.
    if ! pm2 jlist 2>/dev/null | node "$SCRIPT_DIR/lib/pm2-health.mjs" snapshot --app "$PM2_APP_NAME" >"$RELEASE_DIR/.pm2-health-baseline.json"; then
      log_error "Failed to capture PM2 baseline before cutover"
      AUDIOLAD_DEPLOY_LOCK_HELD=1 "$SCRIPT_DIR/rollback.sh" "failed to capture pm2 baseline before cutover"
      exit 1
    fi
  fi
  cat "$RELEASE_DIR/.pm2-health-baseline.json"

  if ! cutover_nginx_to_port "$candidate_port"; then
    log_error "cutover_failed release=${RELEASE_NAME}"
    # Restore symlink to old release if cutover failed before traffic moved.
    if [[ -n "$old_current" && -d "$old_current" ]]; then
      atomic_symlink "$old_current" "$DEPLOY_ROOT/current"
      log_warn "Restored current symlink to previous release after cutover failure"
    fi
    send_deploy_alert "deploy_failed" "Nginx cutover failed for $RELEASE_NAME"
    exit 1
  fi

  CUTOVER_COMPLETED=1
  save_runtime_state "$candidate_port" "$candidate_app"
  write_ecosystem_for_active "$RELEASE_DIR" "$candidate_port" "$candidate_app"
  # Refresh candidate baseline after it becomes the production process.
  if ! pm2 jlist 2>/dev/null | node "$SCRIPT_DIR/lib/pm2-health.mjs" snapshot --app "$candidate_app" >"$RELEASE_DIR/.pm2-health-baseline.json"; then
    log_warn "Could not refresh PM2 baseline for candidate app; keeping previous snapshot"
  fi

  if [[ ! -f "$RELEASE_DIR/.next/BUILD_ID" ]]; then
    log_error "BUILD_ID missing after nginx cutover stage=post_cutover path=$RELEASE_DIR/.next/BUILD_ID"
    AUDIOLAD_DEPLOY_LOCK_HELD=1 "$SCRIPT_DIR/rollback.sh" "BUILD_ID missing after cutover"
    exit 1
  fi

  log_info "Waiting for public readiness with buildId=${EXPECTED_BUILD_ID}"
  if ! wait_for_production_readiness "$PUBLIC_BASE_URL" "$EXPECTED_BUILD_ID" 40 2 "public"; then
    log_error "public_smoke_failed (readiness) release=${RELEASE_NAME}"
    AUDIOLAD_DEPLOY_LOCK_HELD=1 "$SCRIPT_DIR/rollback.sh" "public readiness failed after cutover"
    exit 1
  fi

  log_info "Running production smoke tests"
  if ! "$SCRIPT_DIR/smoke-test.sh" "https://audiolad.ru"; then
    log_error "public_smoke_failed release=${RELEASE_NAME}"
    AUDIOLAD_DEPLOY_LOCK_HELD=1 "$SCRIPT_DIR/rollback.sh" "production smoke failed after cutover"
    exit 1
  fi
  log_info "public_smoke_passed release=${RELEASE_NAME}"

  log_info "Starting post-deploy health watch"
  export PM2_HEALTH_BASELINE_FILE="$RELEASE_DIR/.pm2-health-baseline.json"
  export PM2_APP_NAME="$candidate_app"
  export PRODUCTION_PORT="$candidate_port"
  export EXPECTED_BUILD_ID
  if ! "$SCRIPT_DIR/health-watch.sh" --post-deploy; then
    log_error "Post-deploy health watch failed"
    AUDIOLAD_DEPLOY_LOCK_HELD=1 "$SCRIPT_DIR/rollback.sh" "health watch failed after deploy"
    exit 1
  fi

  log_info "previous_process_stopped app=${OLD_ACTIVE_PM2_APP} port=${OLD_ACTIVE_PORT}"
  stop_pm2_app_safe "$OLD_ACTIVE_PM2_APP" "$OLD_ACTIVE_PORT"
  pm2 save

  rm -f "$RELEASE_DIR/.deploy-inflight"
  unset CANDIDATE_RELEASE_DIR
  prune_old_releases "${RELEASE_RETENTION_KEEP_EXTRA:-1}"
  log_info "deploy_succeeded release=${RELEASE_NAME} commit=${FULL_COMMIT} buildId=${EXPECTED_BUILD_ID} port=${candidate_port} app=${candidate_app}"
  log_info "Deploy completed successfully: $RELEASE_NAME"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

main "$@"
