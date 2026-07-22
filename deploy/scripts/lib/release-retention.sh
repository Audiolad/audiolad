#!/usr/bin/env bash
# Safe release retention for Audiolad deploy roots.
# Keeps current, previous, and N newest extra releases; skips uncertain paths.

RELEASE_RETENTION_KEEP_EXTRA="${RELEASE_RETENTION_KEEP_EXTRA:-3}"
RELEASE_RETENTION_MIN_AGE_SECONDS="${RELEASE_RETENTION_MIN_AGE_SECONDS:-86400}"
RELEASE_RETENTION_DRY_RUN="${RELEASE_RETENTION_DRY_RUN:-0}"
RELEASE_NAME_PATTERN='^[0-9]{8}-[0-9]{6}-[0-9a-f]+$'

release_retention_human_size() {
  du -sh "$1" 2>/dev/null | cut -f1 || echo "0"
}

release_retention_is_valid_name() {
  local name="$1"
  [[ "$name" =~ $RELEASE_NAME_PATTERN ]]
}

release_retention_resolve_paths() {
  RELEASES_DIR="$DEPLOY_ROOT/releases"

  CURRENT_TARGET=""
  PREVIOUS_TARGET=""
  PM2_CWD=""

  if [[ -L "$DEPLOY_ROOT/current" ]]; then
    CURRENT_TARGET="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"
  fi

  if [[ -L "$DEPLOY_ROOT/previous" ]]; then
    PREVIOUS_TARGET="$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || true)"
  fi

  if command -v pm2 >/dev/null 2>&1; then
    PM2_CWD="$(pm2 jlist 2>/dev/null | node -e '
      let input = "";
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        try {
          const apps = JSON.parse(input || "[]");
          const app = apps.find((entry) => entry.name === process.env.PM2_APP_NAME);
          const cwd = app?.pm2_env?.pm_cwd || "";
          process.stdout.write(cwd);
        } catch {
          process.stdout.write("");
        }
      });
    ' PM2_APP_NAME="${PM2_APP_NAME:-audiolad}" || true)"
    if [[ -n "$PM2_CWD" ]]; then
      PM2_CWD="$(readlink -f "$PM2_CWD" 2>/dev/null || true)"
    fi
  fi
}

release_retention_validate_runtime() {
  release_retention_resolve_paths

  if [[ -n "$CURRENT_TARGET" && "$CURRENT_TARGET" != "$RELEASES_DIR"/* ]]; then
    log_error "Current release outside releases dir: $CURRENT_TARGET"
    return 1
  fi

  if [[ -n "$PREVIOUS_TARGET" && "$PREVIOUS_TARGET" != "$RELEASES_DIR"/* ]]; then
    log_error "Previous release outside releases dir: $PREVIOUS_TARGET"
    return 1
  fi

  if [[ -n "$PM2_CWD" && -n "$CURRENT_TARGET" && "$PM2_CWD" != "$CURRENT_TARGET" ]]; then
    log_error "PM2 cwd mismatch: pm2=$PM2_CWD current=$CURRENT_TARGET"
    return 1
  fi

  return 0
}

release_retention_is_protected() {
  local real_release="$1"
  local release_name="$2"
  local now epoch mtime age_seconds open_count

  if [[ "$real_release" == "$CURRENT_TARGET" || "$real_release" == "$PREVIOUS_TARGET" ]]; then
    return 0
  fi

  if [[ -n "$PM2_CWD" && "$real_release" == "$PM2_CWD" ]]; then
    return 0
  fi

  if [[ ! -f "$real_release/.deploy-commit" ]]; then
    return 0
  fi

  if ! release_retention_is_valid_name "$release_name"; then
    return 0
  fi

  now="$(date +%s)"
  mtime="$(stat -c '%Y' "$real_release" 2>/dev/null || echo "$now")"
  age_seconds=$((now - mtime))
  if (( age_seconds < RELEASE_RETENTION_MIN_AGE_SECONDS )); then
    return 0
  fi

  if command -v lsof >/dev/null 2>&1; then
    open_count="$(lsof +D "$real_release" 2>/dev/null | awk 'NR>1 {count++} END {print count+0}')"
    if (( open_count > 0 )); then
      return 0
    fi
  fi

  return 1
}

prune_old_releases() {
  local keep_extra="${1:-$RELEASE_RETENTION_KEEP_EXTRA}"
  local kept_extra=0
  local release real_release release_name size commit

  if ! release_retention_validate_runtime; then
    log_error "Release retention aborted due to runtime mismatch"
    return 1
  fi

  mapfile -t releases < <(ls -1dt "$RELEASES_DIR"/* 2>/dev/null || true)

  log_info "Release retention start keep_extra=$keep_extra dry_run=$RELEASE_RETENTION_DRY_RUN releases=${#releases[@]}"

  for release in "${releases[@]}"; do
    [[ -d "$release" ]] || continue

    real_release="$(readlink -f "$release" 2>/dev/null || true)"
    release_name="$(basename "$real_release")"

    if [[ -z "$real_release" || "$real_release" != "$RELEASES_DIR"/* ]]; then
      log_warn "SKIP release outside releases dir: $release"
      continue
    fi

    if [[ "$real_release" == "$CURRENT_TARGET" || "$real_release" == "$PREVIOUS_TARGET" ]]; then
      log_info "KEEP release (symlink target): $real_release"
      continue
    fi

    if release_retention_is_protected "$real_release" "$release_name"; then
      if [[ ! -f "$real_release/.deploy-commit" ]]; then
        log_warn "SKIP release without .deploy-commit: $real_release"
      elif ! release_retention_is_valid_name "$release_name"; then
        log_warn "SKIP release with unexpected name: $real_release"
      elif [[ -n "$PM2_CWD" && "$real_release" == "$PM2_CWD" ]]; then
        log_info "KEEP release (pm2 cwd): $real_release"
      else
        log_info "KEEP protected release: $real_release"
      fi
      continue
    fi

    if (( kept_extra < keep_extra )); then
      kept_extra=$((kept_extra + 1))
      log_info "KEEP extra release ($kept_extra/$keep_extra): $real_release"
      continue
    fi

    size="$(release_retention_human_size "$real_release")"
    commit="$(tr -d '\n' < "$real_release/.deploy-commit" | cut -c1-12)"
    if [[ "$RELEASE_RETENTION_DRY_RUN" == "1" ]]; then
      log_info "DRY-RUN would remove release size=$size commit=$commit path=$real_release"
      continue
    fi

    log_info "Removing old release size=$size commit=$commit path=$real_release"
    rm -rf "$real_release"
  done

  log_info "Release retention complete kept_extra=$kept_extra"
}
