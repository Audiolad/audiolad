#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<'EOF'
Usage: deploy.sh [commit-ish]

Safely deploy a new release without rebuilding inside the active current directory.
If commit-ish is omitted, deploys the current checked-out commit in GIT_WORKDIR.
EOF
}

COMMIT_REF="${1:-}"
CANDIDATE_PID=""
DEPLOY_LOG_FILE="$DEPLOY_LOG_DIR/deploy-$(date -u +"%Y%m%d-%H%M%S").log"

exec > >(tee -a "$DEPLOY_LOG_FILE") 2>&1

cleanup_candidate() {
  if [[ -n "$CANDIDATE_PID" ]] && kill -0 "$CANDIDATE_PID" 2>/dev/null; then
    log_info "Stopping candidate process $CANDIDATE_PID"
    kill "$CANDIDATE_PID" 2>/dev/null || true
    wait "$CANDIDATE_PID" 2>/dev/null || true
  fi
}

trap cleanup_candidate EXIT

main() {
  require_command git
  require_command npm
  require_command curl
  require_command node
  ensure_dirs
  check_disk_space 2048

  if [[ ! -f "$DEPLOY_ROOT/shared/.env.production" ]]; then
    log_error "Missing $DEPLOY_ROOT/shared/.env.production"
    exit 1
  fi

  if [[ -z "$COMMIT_REF" ]]; then
    COMMIT_REF="$(git -C "$GIT_WORKDIR" rev-parse HEAD)"
  fi

  FULL_COMMIT="$(git -C "$GIT_WORKDIR" rev-parse "$COMMIT_REF")"
  RELEASE_NAME="$(get_release_name "$FULL_COMMIT")"
  RELEASE_DIR="$DEPLOY_ROOT/releases/$RELEASE_NAME"

  if [[ -e "$RELEASE_DIR" ]]; then
    log_error "Release directory already exists: $RELEASE_DIR"
    exit 1
  fi

  log_info "Creating release $RELEASE_NAME from commit $FULL_COMMIT"
  mkdir -p "$RELEASE_DIR"

  git -C "$GIT_WORKDIR" archive "$FULL_COMMIT" | tar -x -C "$RELEASE_DIR"
  ln -sfn "$DEPLOY_ROOT/shared/.env.production" "$RELEASE_DIR/.env.local"
  ln -sfn "$DEPLOY_ROOT/shared/.env.production" "$RELEASE_DIR/.env.production"

  cd "$RELEASE_DIR"
  npm ci
  npm run lint
  npm run build

  if [[ ! -f ".next/BUILD_ID" ]]; then
    log_error "Build failed: .next/BUILD_ID missing"
    exit 1
  fi

  log_info "Starting candidate on port $CANDIDATE_PORT"
  PORT="$CANDIDATE_PORT" NODE_ENV=production npm start >/tmp/audiolad-candidate.log 2>&1 &
  CANDIDATE_PID=$!

  if ! wait_for_health "http://127.0.0.1:${CANDIDATE_PORT}" 40 2; then
    log_error "Candidate health check failed"
    send_deploy_alert "deploy_failed" "Candidate health check failed for $RELEASE_NAME"
    exit 1
  fi

  log_info "Running smoke tests against candidate"
  if ! "$SCRIPT_DIR/smoke-test.sh" "http://127.0.0.1:${CANDIDATE_PORT}"; then
    log_error "Candidate smoke tests failed"
    send_deploy_alert "deploy_failed" "Candidate smoke tests failed for $RELEASE_NAME"
    exit 1
  fi

  cleanup_candidate
  trap - EXIT

  local old_current=""
  if [[ -L "$DEPLOY_ROOT/current" ]]; then
    old_current="$(readlink -f "$DEPLOY_ROOT/current")"
    atomic_symlink "$old_current" "$DEPLOY_ROOT/previous"
    log_info "Previous release set to $old_current"
  fi

  atomic_symlink "$RELEASE_DIR" "$DEPLOY_ROOT/current"
  log_info "Current release switched to $RELEASE_DIR"

  printf '%s\n' "$FULL_COMMIT" > "$RELEASE_DIR/.deploy-commit"

  if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    pm2 startOrReload "$DEPLOY_ROOT/ecosystem.config.cjs" --only "$PM2_APP_NAME" --update-env
  else
    pm2 start "$DEPLOY_ROOT/ecosystem.config.cjs" --only "$PM2_APP_NAME"
  fi
  pm2 save

  if ! wait_for_health "http://127.0.0.1:${PRODUCTION_PORT}" 40 2; then
    log_error "Production health check failed after switch"
    "$SCRIPT_DIR/rollback.sh" "production health failed after deploy"
    exit 1
  fi

  if ! wait_for_build_id_match "$RELEASE_DIR"; then
    log_error "Production BUILD_ID did not match release after reload"
    "$SCRIPT_DIR/rollback.sh" "build id mismatch after deploy"
    exit 1
  fi

  log_info "Capturing PM2 baseline after stable production reload"
  if ! pm2 jlist 2>/dev/null | node "$SCRIPT_DIR/lib/pm2-health.mjs" snapshot --app "$PM2_APP_NAME" >"$RELEASE_DIR/.pm2-health-baseline.json"; then
    log_error "Failed to capture PM2 baseline after reload"
    "$SCRIPT_DIR/rollback.sh" "failed to capture pm2 baseline after reload"
    exit 1
  fi
  cat "$RELEASE_DIR/.pm2-health-baseline.json"

  log_info "Running production smoke tests"
  if ! "$SCRIPT_DIR/smoke-test.sh" "https://audiolad.ru"; then
    log_error "Production smoke tests failed"
    "$SCRIPT_DIR/rollback.sh" "production smoke failed after deploy"
    exit 1
  fi

  log_info "Starting post-deploy health watch"
  export PM2_HEALTH_BASELINE_FILE="$RELEASE_DIR/.pm2-health-baseline.json"
  if ! "$SCRIPT_DIR/health-watch.sh" --post-deploy; then
    log_error "Post-deploy health watch failed"
    "$SCRIPT_DIR/rollback.sh" "health watch failed after deploy"
    exit 1
  fi

  prune_old_releases 3
  log_info "Deploy completed successfully: $RELEASE_NAME"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

main "$@"
