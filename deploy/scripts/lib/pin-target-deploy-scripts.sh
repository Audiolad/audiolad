#!/usr/bin/env bash
# Extract deploy/scripts for a target SHA and exec that deploy.sh.
# GIT_WORKDIR is a git object store only: fetch + archive, never checkout/reset.
# Do not source zero-downtime or policy helpers from the launching worktree.

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
GIT_WORKDIR="${GIT_WORKDIR:-/var/www/audiolad}"
AUDIOLAD_DEPLOY_SCRIPTS_STORE="${AUDIOLAD_DEPLOY_SCRIPTS_STORE:-$DEPLOY_ROOT/shared/deploy-scripts}"

pin_log() {
  printf '[%s] [INFO] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

pin_error() {
  printf '[%s] [ERROR] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&2
}

logical_path_uses_current_symlink() {
  local path="$1"
  case "$path" in
    */current/*|*/current)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

assert_safe_scripts_dest() {
  local dest="$1"
  local full_commit="$2"
  local store="$3"

  if [[ ! "$full_commit" =~ ^[0-9a-f]{40}$ ]]; then
    pin_error "pin extract requires a full 40-char SHA, got: ${full_commit}"
    return 1
  fi
  if [[ "$dest" != "${store}/${full_commit}" ]]; then
    pin_error "refusing unexpected deploy-scripts dest: ${dest}"
    return 1
  fi
  case "$store" in
    */shared/deploy-scripts)
      ;;
    *)
      pin_error "refusing unexpected deploy-scripts store: ${store}"
      return 1
      ;;
  esac
}

fetch_origin_main_objects_only() {
  if git -C "$GIT_WORKDIR" remote get-url origin >/dev/null 2>&1; then
    pin_log "Fetching origin main (objects only; worktree HEAD unchanged)"
    git -C "$GIT_WORKDIR" fetch origin main
  else
    pin_log "Skipping origin fetch (no origin remote configured in GIT_WORKDIR)"
  fi
}

resolve_pin_commit() {
  local commit_ref="$1"
  git -C "$GIT_WORKDIR" rev-parse --verify "${commit_ref}^{commit}"
}

pin_has_reconcile_artifacts() {
  local root="$1"
  [[ -f "$root/deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.service" ]] &&
    [[ -f "$root/deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer" ]] &&
    [[ -f "$root/deploy/logrotate/audiolad-author-appreciation-getcourse-reconcile" ]]
}

extract_target_deploy_scripts() {
  local full_commit="$1"
  local store="$AUDIOLAD_DEPLOY_SCRIPTS_STORE"
  local dest="${store}/${full_commit}"
  local tmp marker

  assert_safe_scripts_dest "$dest" "$full_commit" "$store" || return 1
  mkdir -p "$store"

  if [[ -f "$dest/deploy/scripts/deploy.sh" && -f "$dest/deploy/scripts/.pinned-commit" ]]; then
    marker="$(tr -d '\n' < "$dest/deploy/scripts/.pinned-commit")"
    if [[ "$marker" == "$full_commit" ]] && pin_has_reconcile_artifacts "$dest"; then
      printf '%s\n' "$dest"
      return 0
    fi
  fi

  tmp="$(mktemp -d "${store}/.tmp.${full_commit}.XXXXXX")"
  if ! git -C "$GIT_WORKDIR" archive "$full_commit" deploy/scripts deploy/systemd deploy/logrotate | tar -x -C "$tmp"; then
    pin_error "git archive of deploy/scripts deploy/systemd deploy/logrotate failed for ${full_commit}"
    rm -rf "$tmp"
    return 1
  fi
  if [[ ! -f "$tmp/deploy/scripts/deploy.sh" ]]; then
    pin_error "target SHA ${full_commit} is missing deploy/scripts/deploy.sh"
    rm -rf "$tmp"
    return 1
  fi
  if ! pin_has_reconcile_artifacts "$tmp"; then
    pin_error "target SHA ${full_commit} is missing reconcile systemd/logrotate artifacts"
    rm -rf "$tmp"
    return 1
  fi
  printf '%s\n' "$full_commit" > "$tmp/deploy/scripts/.pinned-commit"
  chmod +x "$tmp/deploy/scripts/deploy.sh" "$tmp/deploy/scripts/run-from-target-sha.sh" 2>/dev/null || true

  rm -rf "$dest"
  mv "$tmp" "$dest"
  printf '%s\n' "$dest"
}

exec_pinned_target_deploy() {
  local commit_ref="${1:-}"
  local full_commit extracted deploy_sh

  if [[ -z "$commit_ref" || "$commit_ref" == "-h" || "$commit_ref" == "--help" ]]; then
    return 0
  fi

  fetch_origin_main_objects_only

  if ! full_commit="$(resolve_pin_commit "$commit_ref")"; then
    pin_error "Invalid deploy commit ref: ${commit_ref}"
    return 1
  fi

  if ! extracted="$(extract_target_deploy_scripts "$full_commit")"; then
    return 1
  fi

  deploy_sh="${extracted}/deploy/scripts/deploy.sh"
  if logical_path_uses_current_symlink "$deploy_sh" || logical_path_uses_current_symlink "$extracted"; then
    pin_error "refusing to exec deploy.sh via /current symlink"
    return 1
  fi
  if [[ ! -f "$deploy_sh" ]]; then
    pin_error "pinned deploy.sh missing: ${deploy_sh}"
    return 1
  fi

  pin_log "Pinned deploy scripts to ${full_commit} at ${extracted}"
  export AUDIOLAD_DEPLOY_SCRIPTS_PINNED=1
  export AUDIOLAD_DEPLOY_SCRIPTS_PINNED_SHA="$full_commit"
  export GIT_WORKDIR DEPLOY_ROOT
  exec "$deploy_sh" "$full_commit"
}
