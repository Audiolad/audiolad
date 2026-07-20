#!/usr/bin/env bash
# Canonical deploy policy helpers — sourced by deploy.sh and regression tests.

CANONICAL_REF="${CANONICAL_REF:-origin/main}"

canonical_fetch_main() {
  if git -C "$GIT_WORKDIR" remote get-url origin >/dev/null 2>&1; then
    log_info "Fetching ${CANONICAL_REF} from origin"
    git -C "$GIT_WORKDIR" fetch origin main
  else
    log_info "Skipping origin fetch (no origin remote configured in GIT_WORKDIR)"
  fi
}

resolve_deploy_commit() {
  local commit_ref="${1:-}"
  git -C "$GIT_WORKDIR" rev-parse --verify "${commit_ref}^{commit}"
}

verify_commit_object_exists() {
  local full_commit="$1"
  git -C "$GIT_WORKDIR" cat-file -e "${full_commit}^{commit}"
}

resolve_canonical_head() {
  git -C "$GIT_WORKDIR" rev-parse --verify "${CANONICAL_REF}^{commit}"
}

deploy_override_active() {
  [[ "${AUDIOLAD_DEPLOY_OVERRIDE:-}" == "1" ]]
}

verify_canonical_deploy_candidate() {
  local full_commit="$1"
  local canonical_head

  canonical_head="$(resolve_canonical_head)"

  if deploy_override_active; then
    if [[ -z "${AUDIOLAD_DEPLOY_OVERRIDE_REASON:-}" ]]; then
      log_error "AUDIOLAD_DEPLOY_OVERRIDE=1 requires non-empty AUDIOLAD_DEPLOY_OVERRIDE_REASON"
      return 1
    fi
    log_warn "DEPLOY POLICY OVERRIDE ACTIVE — canonical ancestor check skipped"
    log_warn "Override reason: ${AUDIOLAD_DEPLOY_OVERRIDE_REASON}"
    return 0
  fi

  # Candidate must be an ancestor of (or equal to) canonical main HEAD.
  if ! git -C "$GIT_WORKDIR" merge-base --is-ancestor "$full_commit" "$CANONICAL_REF"; then
    log_error "Deploy rejected: commit $full_commit is not reachable from ${CANONICAL_REF} (head=$canonical_head)"
    log_error "Only commits merged into canonical main may be deployed."
    return 1
  fi

  log_info "Canonical policy OK: $full_commit is reachable from ${CANONICAL_REF} (head=$canonical_head)"
  return 0
}

warn_if_workdir_dirty() {
  local dirty_tracked=0
  local dirty_untracked=0

  if ! git -C "$GIT_WORKDIR" diff-index --quiet HEAD -- 2>/dev/null; then
    dirty_tracked=1
  fi

  if [[ -n "$(git -C "$GIT_WORKDIR" ls-files --others --exclude-standard 2>/dev/null)" ]]; then
    dirty_untracked=1
  fi

  if (( dirty_tracked || dirty_untracked )); then
    log_warn "GIT_WORKDIR ($GIT_WORKDIR) is dirty"
    if (( dirty_tracked )); then
      log_warn "  - modified tracked files present (NOT included in release; deploy uses git archive only)"
    fi
    if (( dirty_untracked )); then
      log_warn "  - untracked files present (NOT included in release; deploy uses git archive only)"
    fi
  fi
}

write_deploy_metadata() {
  local release_dir="$1"
  local full_commit="$2"
  local canonical_head="$3"
  local override_flag="${4:-0}"
  local override_reason="${5:-}"
  local deployed_by="${6:-$(whoami 2>/dev/null || echo unknown)}"
  local deployed_at
  deployed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  cat >"$release_dir/.deploy-metadata" <<EOF
commit=${full_commit}
canonical_ref=${CANONICAL_REF}
canonical_head=${canonical_head}
deployed_at=${deployed_at}
deployed_by=${deployed_by}
override=${override_flag}
override_reason=${override_reason}
EOF
}

validate_deploy_commit_argument() {
  local commit_ref="${1:-}"

  if [[ -z "$commit_ref" ]]; then
    log_error "Deploy commit SHA is required."
    log_error "Usage: deploy.sh <commit-sha>"
    log_error "Production deploys must target an explicit commit reachable from ${CANONICAL_REF}."
    return 1
  fi

  if [[ "$commit_ref" == "-h" || "$commit_ref" == "--help" ]]; then
    return 2
  fi

  if [[ $# -gt 1 ]]; then
    log_error "Too many arguments. Usage: deploy.sh <commit-sha>"
    return 1
  fi

  return 0
}

run_deploy_policy_gate() {
  local commit_ref="${1:-}"
  local full_commit canonical_head override_flag override_reason

  canonical_fetch_main

  if ! full_commit="$(resolve_deploy_commit "$commit_ref")"; then
    log_error "Invalid deploy commit ref: $commit_ref"
    return 1
  fi

  if ! verify_commit_object_exists "$full_commit"; then
    log_error "Deploy commit object missing after fetch: $full_commit"
    return 1
  fi

  if ! verify_canonical_deploy_candidate "$full_commit"; then
    return 1
  fi

  warn_if_workdir_dirty

  canonical_head="$(resolve_canonical_head)"
  if deploy_override_active; then
    override_flag=1
    override_reason="${AUDIOLAD_DEPLOY_OVERRIDE_REASON}"
  else
    override_flag=0
    override_reason=""
  fi

  DEPLOY_FULL_COMMIT="$full_commit"
  DEPLOY_CANONICAL_HEAD="$canonical_head"
  DEPLOY_OVERRIDE_FLAG="$override_flag"
  DEPLOY_OVERRIDE_REASON="$override_reason"
  return 0
}
