#!/usr/bin/env bash
# Safe release retention for Audiolad deploy roots.
# Keeps unique set: current, previous, and up to N newest successful extras.
# Age is only a short safety window for in-flight deploys — not a 24h retention rule.

RELEASE_RETENTION_KEEP_EXTRA="${RELEASE_RETENTION_KEEP_EXTRA:-1}"
# Protective age for successful releases (default 30 minutes).
RELEASE_RETENTION_MIN_AGE_SECONDS="${RELEASE_RETENTION_MIN_AGE_SECONDS:-1800}"
# Incomplete (no .deploy-commit) may be removed only after this age (default 2 hours).
RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS="${RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS:-7200}"
# Compatibility: legacy 24h knob is ignored for successful release pruning.
RELEASE_RETENTION_LEGACY_MIN_AGE_SECONDS="${RELEASE_RETENTION_LEGACY_MIN_AGE_SECONDS:-86400}"
RELEASE_RETENTION_DRY_RUN="${RELEASE_RETENTION_DRY_RUN:-0}"
RELEASE_RETENTION_EMERGENCY="${RELEASE_RETENTION_EMERGENCY:-0}"
RELEASE_NAME_PATTERN='^[0-9]{8}-[0-9]{6}-[0-9a-f]+$'

release_retention_human_size() {
  du -sh "$1" 2>/dev/null | cut -f1 || echo "0"
}

release_retention_bytes() {
  du -sb "$1" 2>/dev/null | cut -f1 || echo 0
}

release_retention_is_valid_name() {
  local name="$1"
  [[ "$name" =~ $RELEASE_NAME_PATTERN ]]
}

release_retention_age_seconds() {
  local path="$1"
  local now mtime
  now="$(date +%s)"
  mtime="$(stat -c '%Y' "$path" 2>/dev/null || echo "$now")"
  echo $((now - mtime))
}

release_retention_resolve_pm2_cwd() {
  PM2_CWD=""
  if ! command -v pm2 >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    return 0
  fi

  PM2_CWD="$(
    pm2 jlist 2>/dev/null | node -e '
      let input = "";
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        try {
          const apps = JSON.parse(input || "[]");
          const wanted = process.env.PM2_APP_NAME || "";
          const online = apps.filter((entry) => {
            const name = String(entry?.name || "");
            const status = String(entry?.pm2_env?.status || "");
            if (status && status !== "online") return false;
            if (wanted && name === wanted) return true;
            return name === "audiolad" || name.startsWith("audiolad-p");
          });
          const preferred = wanted
            ? online.find((entry) => entry.name === wanted) || online[0]
            : online[0];
          process.stdout.write(preferred?.pm2_env?.pm_cwd || "");
        } catch {
          process.stdout.write("");
        }
      });
    ' 2>/dev/null || true
  )"

  if [[ -n "$PM2_CWD" ]]; then
    PM2_CWD="$(readlink -f "$PM2_CWD" 2>/dev/null || true)"
  fi
}

release_retention_resolve_paths() {
  RELEASES_DIR="$DEPLOY_ROOT/releases"

  CURRENT_TARGET=""
  PREVIOUS_TARGET=""

  if [[ -L "$DEPLOY_ROOT/current" ]]; then
    CURRENT_TARGET="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"
  fi

  if [[ -L "$DEPLOY_ROOT/previous" ]]; then
    PREVIOUS_TARGET="$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || true)"
  fi

  release_retention_resolve_pm2_cwd
}

release_retention_validate_runtime() {
  release_retention_resolve_paths

  if [[ -z "${DEPLOY_ROOT:-}" || "$DEPLOY_ROOT" != /* ]]; then
    log_error "DEPLOY_ROOT must be an absolute path"
    return 1
  fi

  if [[ ! -d "$RELEASES_DIR" || -L "$RELEASES_DIR" ]]; then
    log_error "Releases directory missing or is a symlink: $RELEASES_DIR"
    return 1
  fi

  if [[ -n "$CURRENT_TARGET" && "$CURRENT_TARGET" != "$RELEASES_DIR"/* ]]; then
    log_error "Current release outside releases dir: $CURRENT_TARGET"
    return 1
  fi

  if [[ -n "$PREVIOUS_TARGET" && "$PREVIOUS_TARGET" != "$RELEASES_DIR"/* ]]; then
    log_error "Previous release outside releases dir: $PREVIOUS_TARGET"
    return 1
  fi

  # Soft warning only: blue/green cutover can briefly diverge; never abort prune for that.
  if [[ -n "$PM2_CWD" && -n "$CURRENT_TARGET" && "$PM2_CWD" != "$CURRENT_TARGET" ]]; then
    log_warn "PM2 cwd differs from current (keeping both): pm2=$PM2_CWD current=$CURRENT_TARGET"
  fi

  return 0
}

release_retention_is_successful() {
  local real_release="$1"
  [[ -f "$real_release/.deploy-commit" ]]
}

release_retention_is_open() {
  local real_release="$1"
  local open_count=0

  if [[ "${RELEASE_RETENTION_SKIP_LSOF:-0}" == "1" ]]; then
    return 1
  fi

  if command -v lsof >/dev/null 2>&1; then
    # lsof +D can hang on large trees; bound it tightly.
    open_count="$(
      timeout 2s lsof +D "$real_release" 2>/dev/null | awk 'NR>1 {count++} END {print count+0}' || true
    )"
  fi
  open_count="${open_count//$'\n'/}"
  [[ "$open_count" =~ ^[0-9]+$ ]] || open_count=0

  (( open_count > 0 ))
}

# Returns 0 when the release must not be deleted yet.
release_retention_is_protected() {
  local real_release="$1"
  local release_name="$2"
  local age_seconds min_age

  if [[ "$real_release" == "$CURRENT_TARGET" || "$real_release" == "$PREVIOUS_TARGET" ]]; then
    return 0
  fi

  if [[ -n "$PM2_CWD" && "$real_release" == "$PM2_CWD" ]]; then
    return 0
  fi

  if ! release_retention_is_valid_name "$release_name"; then
    return 0
  fi

  age_seconds="$(release_retention_age_seconds "$real_release")"

  if ! release_retention_is_successful "$real_release"; then
    if (( age_seconds < RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS )); then
      return 0
    fi
    return 1
  fi

  min_age="$RELEASE_RETENTION_MIN_AGE_SECONDS"
  if [[ "$RELEASE_RETENTION_EMERGENCY" == "1" ]]; then
    # Emergency still keeps the hard 30-minute in-flight window.
    min_age="$RELEASE_RETENTION_MIN_AGE_SECONDS"
  fi

  if (( age_seconds < min_age )); then
    return 0
  fi

  if release_retention_is_open "$real_release"; then
    return 0
  fi

  return 1
}

release_retention_refresh_guards() {
  release_retention_resolve_paths
}

release_retention_safe_to_delete() {
  local real_release="$1"

  [[ -n "$real_release" ]] || return 1
  [[ "$real_release" == /* ]] || return 1
  [[ "$real_release" != "/" ]] || return 1
  [[ -e "$real_release" ]] || return 1
  [[ ! -L "$real_release" ]] || return 1
  [[ "$real_release" == "$RELEASES_DIR"/* ]] || return 1
  [[ "$real_release" != "$CURRENT_TARGET" ]] || return 1
  [[ "$real_release" != "$PREVIOUS_TARGET" ]] || return 1
  [[ -z "$PM2_CWD" || "$real_release" != "$PM2_CWD" ]] || return 1

  # Re-resolve symlinks immediately before delete.
  local live_current live_previous
  live_current="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"
  live_previous="$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || true)"
  [[ "$real_release" != "$live_current" ]] || return 1
  [[ "$real_release" != "$live_previous" ]] || return 1

  return 0
}

prune_old_releases() {
  local keep_extra="${1:-$RELEASE_RETENTION_KEEP_EXTRA}"
  local kept_extra=0
  local release real_release release_name size commit age_seconds
  local removed_count=0
  local removed_bytes=0

  if ! release_retention_validate_runtime; then
    log_error "Release retention aborted due to runtime mismatch"
    return 1
  fi

  mapfile -t releases < <(ls -1dt "$RELEASES_DIR"/* 2>/dev/null || true)

  log_info "Release retention start keep_extra=$keep_extra dry_run=$RELEASE_RETENTION_DRY_RUN emergency=$RELEASE_RETENTION_EMERGENCY min_age=${RELEASE_RETENTION_MIN_AGE_SECONDS}s incomplete_age=${RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS}s releases=${#releases[@]} current=${CURRENT_TARGET:-none} previous=${PREVIOUS_TARGET:-none} pm2=${PM2_CWD:-none}"

  for release in "${releases[@]}"; do
    [[ -d "$release" || -L "$release" ]] || continue

    real_release="$(readlink -f "$release" 2>/dev/null || true)"
    release_name="$(basename "${real_release:-$release}")"

    if [[ -z "$real_release" || "$real_release" != "$RELEASES_DIR"/* ]]; then
      log_warn "SKIP release outside releases dir: $release"
      continue
    fi

    # Refresh guards before each decision.
    release_retention_refresh_guards

    if [[ "$real_release" == "$CURRENT_TARGET" ]]; then
      log_info "KEEP release (current): $real_release"
      continue
    fi

    if [[ "$real_release" == "$PREVIOUS_TARGET" ]]; then
      log_info "KEEP release (previous): $real_release"
      continue
    fi

    if [[ -n "$PM2_CWD" && "$real_release" == "$PM2_CWD" ]]; then
      log_info "KEEP release (pm2 cwd): $real_release"
      continue
    fi

    age_seconds="$(release_retention_age_seconds "$real_release")"

    if release_retention_is_protected "$real_release" "$release_name"; then
      if ! release_retention_is_successful "$real_release"; then
        log_info "KEEP incomplete release (age=${age_seconds}s < ${RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS}s): $real_release"
      elif ! release_retention_is_valid_name "$release_name"; then
        log_warn "KEEP release with unexpected name: $real_release"
      elif (( age_seconds < RELEASE_RETENTION_MIN_AGE_SECONDS )); then
        log_info "KEEP successful release (age=${age_seconds}s < ${RELEASE_RETENTION_MIN_AGE_SECONDS}s): $real_release"
      else
        log_info "KEEP protected release: $real_release"
      fi
      continue
    fi

    if release_retention_is_successful "$real_release"; then
      if (( kept_extra < keep_extra )); then
        kept_extra=$((kept_extra + 1))
        log_info "KEEP extra successful release ($kept_extra/$keep_extra): $real_release"
        continue
      fi
      commit="$(tr -d '\n' < "$real_release/.deploy-commit" | cut -c1-12)"
      size="$(release_retention_human_size "$real_release")"
      if [[ "$RELEASE_RETENTION_DRY_RUN" == "1" ]]; then
        log_info "DRY-RUN would remove successful release size=$size commit=$commit age=${age_seconds}s path=$real_release"
        continue
      fi
      if ! release_retention_safe_to_delete "$real_release"; then
        log_warn "SKIP delete after re-check: $real_release"
        continue
      fi
      removed_bytes=$((removed_bytes + $(release_retention_bytes "$real_release")))
      log_info "Removing successful release size=$size commit=$commit age=${age_seconds}s path=$real_release"
      rm -rf "$real_release"
      removed_count=$((removed_count + 1))
      continue
    fi

    # Incomplete and past protective age.
    size="$(release_retention_human_size "$real_release")"
    if [[ "$RELEASE_RETENTION_DRY_RUN" == "1" ]]; then
      log_info "DRY-RUN would remove incomplete release size=$size age=${age_seconds}s path=$real_release"
      continue
    fi
    if ! release_retention_safe_to_delete "$real_release"; then
      log_warn "SKIP incomplete delete after re-check: $real_release"
      continue
    fi
    removed_bytes=$((removed_bytes + $(release_retention_bytes "$real_release")))
    log_info "Removing incomplete release size=$size age=${age_seconds}s path=$real_release"
    rm -rf "$real_release"
    removed_count=$((removed_count + 1))
  done

  RELEASE_RETENTION_REMOVED_COUNT="$removed_count"
  RELEASE_RETENTION_REMOVED_BYTES="$removed_bytes"
  log_info "Release retention complete kept_extra=$kept_extra removed=$removed_count removed_bytes=$removed_bytes"
}
