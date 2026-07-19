#!/usr/bin/env bash
# Audiolad production disk hygiene — safe, idempotent, no service restarts.
# Logs go to stdout/stderr → journald (SyslogIdentifier=audiolad-maintenance).
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT-/var/www/audiolad-deploy}"
GIT_WORKDIR="${GIT_WORKDIR:-/var/www/audiolad}"
LOCK_FILE="${LOCK_FILE:-/run/audiolad-maintenance.lock}"
KEEP_EXTRA_RELEASES="${KEEP_EXTRA_RELEASES:-1}"
RELEASE_PRUNE_ENABLED="${RELEASE_PRUNE_ENABLED:-0}"
DRY_RUN="${DRY_RUN:-0}"

CURSOR_CACHE_DIR="/tmp/cursor-sandbox-cache"
CURSOR_CACHE_MAX_MB="${CURSOR_CACHE_MAX_MB:-2048}"
CURSOR_CACHE_MAX_AGE_DAYS="${CURSOR_CACHE_MAX_AGE_DAYS:-7}"
CURSOR_CACHE_EMERGENCY_AGE_DAYS="${CURSOR_CACHE_EMERGENCY_AGE_DAYS:-2}"

JOURNAL_MAX_MB="${JOURNAL_MAX_MB:-150}"
TMP_AUDIOLAD_MAX_AGE_DAYS="${TMP_AUDIOLAD_MAX_AGE_DAYS:-7}"

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

require_absolute_dir() {
  local label="$1"
  local path="$2"

  if [[ -z "$path" || "$path" != /* ]]; then
    log "ERROR ${label} must be an absolute path, got: ${path:-<empty>}"
    exit 1
  fi

  if [[ ! -d "$path" ]]; then
    log "ERROR ${label} directory missing: $path"
    exit 1
  fi

  if [[ -L "$path" ]]; then
    log "ERROR ${label} must not be a symlink: $path"
    exit 1
  fi
}

bytes_of() {
  local path="$1"
  if [[ -e "$path" ]]; then
    du -sb "$path" 2>/dev/null | cut -f1 || echo 0
  else
    echo 0
  fi
}

human_of() {
  du -sh "$1" 2>/dev/null | cut -f1 || echo "0"
}

is_path_open() {
  local target="$1"
  local open_path

  for open_path in "${OPEN_PATHS[@]:-}"; do
    [[ -n "$open_path" ]] || continue
    if [[ "$target" == "$open_path" || "$target" == "$open_path/"* ]]; then
      return 0
    fi
  done

  return 1
}

load_open_paths() {
  OPEN_PATHS=()
  [[ -d "$CURSOR_CACHE_DIR" && ! -L "$CURSOR_CACHE_DIR" ]] || return 0

  mapfile -t OPEN_PATHS < <(
    lsof +D "$CURSOR_CACHE_DIR" 2>/dev/null | awk 'NR>1 {print $NF}' | sort -u || true
  )
}

resolve_deploy_paths() {
  if [[ -z "${DEPLOY_ROOT}" ]]; then
    log "ERROR DEPLOY_ROOT must be an absolute path, got: <empty>"
    exit 1
  fi

  DEPLOY_ROOT="$(readlink -f "$DEPLOY_ROOT")"
  require_absolute_dir "DEPLOY_ROOT" "$DEPLOY_ROOT"

  RELEASES_DIR="$DEPLOY_ROOT/releases"
  require_absolute_dir "RELEASES_DIR" "$RELEASES_DIR"

  CURRENT_TARGET=""
  PREVIOUS_TARGET=""

  if [[ -L "$DEPLOY_ROOT/current" ]]; then
    CURRENT_TARGET="$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || true)"
  fi

  if [[ -L "$DEPLOY_ROOT/previous" ]]; then
    PREVIOUS_TARGET="$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || true)"
  fi

  if [[ -n "$CURRENT_TARGET" && "$CURRENT_TARGET" != "$RELEASES_DIR"/* ]]; then
    log "ERROR current release outside releases dir: $CURRENT_TARGET"
    exit 1
  fi

  if [[ -n "$PREVIOUS_TARGET" && "$PREVIOUS_TARGET" != "$RELEASES_DIR"/* ]]; then
    log "ERROR previous release outside releases dir: $PREVIOUS_TARGET"
    exit 1
  fi
}

remove_path() {
  local path="$1"
  local reason="$2"

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY-RUN would remove ($reason): $path"
    return 0
  fi

  rm -rf "$path"
  log "REMOVE ($reason): $path"
}

prune_old_releases() {
  if [[ "$RELEASE_PRUNE_ENABLED" != "1" ]]; then
    log "SKIP release prune (RELEASE_PRUNE_ENABLED=0)"
    return 0
  fi

  resolve_deploy_paths

  mapfile -t releases < <(ls -1dt "$RELEASES_DIR"/* 2>/dev/null || true)
  local kept_extra=0

  for release in "${releases[@]}"; do
    [[ -d "$release" ]] || continue

    local real_release
    real_release="$(readlink -f "$release" 2>/dev/null || true)"

    if [[ -z "$real_release" || "$real_release" != "$RELEASES_DIR"/* ]]; then
      log "SKIP release outside releases dir: $release"
      continue
    fi

    if [[ "$real_release" == "$CURRENT_TARGET" || "$real_release" == "$PREVIOUS_TARGET" ]]; then
      log "KEEP release (symlink target): $real_release"
      continue
    fi

    if [[ ! -f "$real_release/.deploy-commit" ]]; then
      log "SKIP release without .deploy-commit: $real_release"
      continue
    fi

    if (( kept_extra < KEEP_EXTRA_RELEASES )); then
      kept_extra=$((kept_extra + 1))
      log "KEEP extra release ($kept_extra/$KEEP_EXTRA_RELEASES): $real_release"
      continue
    fi

    local size commit
    size="$(human_of "$real_release")"
    commit="$(tr -d '\n' < "$real_release/.deploy-commit" | cut -c1-12)"
    log "REMOVE old release size=$size commit=$commit path=$real_release"
    remove_path "$real_release" "old release"
  done
}

prune_cursor_sandbox_cache() {
  if [[ ! -d "$CURSOR_CACHE_DIR" || -L "$CURSOR_CACHE_DIR" ]]; then
    log "SKIP cursor cache (missing or symlink): $CURSOR_CACHE_DIR"
    return 0
  fi

  local real_cache_dir
  real_cache_dir="$(readlink -f "$CURSOR_CACHE_DIR" 2>/dev/null || true)"
  if [[ "$real_cache_dir" != "/tmp/cursor-sandbox-cache" ]]; then
    log "ERROR cursor cache resolved outside expected path: $real_cache_dir"
    return 1
  fi

  load_open_paths
  local before_mb max_age_days
  before_mb=$(( $(bytes_of "$real_cache_dir") / 1024 / 1024 ))
  max_age_days="$CURSOR_CACHE_MAX_AGE_DAYS"

  if (( before_mb > CURSOR_CACHE_MAX_MB )); then
    max_age_days="$CURSOR_CACHE_EMERGENCY_AGE_DAYS"
    log "cursor-sandbox-cache emergency mode: size=${before_mb}MB > ${CURSOR_CACHE_MAX_MB}MB, age>${max_age_days}d"
  else
    log "cursor-sandbox-cache normal mode: size=${before_mb}MB, age>${max_age_days}d"
  fi

  while IFS= read -r -d '' entry; do
    if is_path_open "$entry"; then
      log "SKIP open cursor cache entry: $entry"
      continue
    fi
    log "REMOVE aged cursor cache entry (>${max_age_days}d): $entry"
    remove_path "$entry" "aged cursor cache"
  done < <(find "$real_cache_dir" -mindepth 1 -mtime "+${max_age_days}" -print0 2>/dev/null)

  while (( $(bytes_of "$real_cache_dir") / 1024 / 1024 > CURSOR_CACHE_MAX_MB )); do
    local oldest=""
    while IFS= read -r candidate; do
      [[ -n "$candidate" && "$candidate" != "$real_cache_dir" ]] || continue
      if is_path_open "$candidate"; then
        log "SKIP open cursor cache entry (size cap): $candidate"
        continue
      fi
      oldest="$candidate"
      break
    done < <(find "$real_cache_dir" -mindepth 1 -printf '%T+ %p\n' 2>/dev/null | sort | awk '{ $1=""; sub(/^ /,""); print }')

    [[ -n "$oldest" ]] || break
    log "REMOVE oldest cursor cache entry (size cap): $oldest"
    remove_path "$oldest" "oldest cursor cache"
  done

  local after_mb=$(( $(bytes_of "$real_cache_dir") / 1024 / 1024 ))
  log "cursor-sandbox-cache after=${after_mb}MB open_paths=${#OPEN_PATHS[@]}"
}

prune_stale_tmp() {
  find /tmp -maxdepth 1 -type d \( -name 'audiolad-*' -o -name 'playwright_chromiumdev_profile-*' \) -mtime "+${TMP_AUDIOLAD_MAX_AGE_DAYS}" -print0 2>/dev/null |
    while IFS= read -r -d '' dir; do
      remove_path "$dir" "stale tmp"
    done
}

prune_dev_next_cache() {
  local next_dir="$GIT_WORKDIR/.next"
  if [[ -d "$next_dir" && ! -L "$next_dir" ]]; then
    log "REMOVE dev .next cache size=$(human_of "$next_dir") path=$next_dir"
    remove_path "$next_dir" "dev .next"
  fi
}

prune_rotated_logs() {
  find /var/log/nginx -type f \( -name '*.gz' -o -name '*.1' -o -name '*.2' \) -mtime +14 -print0 2>/dev/null |
    while IFS= read -r -d '' file; do
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY-RUN would remove rotated nginx log: $file"
      else
        rm -f "$file"
        log "REMOVE rotated nginx log: $file"
      fi
    done

  find /var/log -maxdepth 1 -type f \( -name 'auth.log.*' -o -name 'syslog.*' -o -name 'btmp' -o -name 'btmp.1' \) -mtime +14 -print0 2>/dev/null |
    while IFS= read -r -d '' file; do
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY-RUN would remove rotated system log: $file"
      else
        rm -f "$file"
        log "REMOVE rotated system log: $file"
      fi
    done
}

prune_npm_cache() {
  if [[ -d /root/.npm ]]; then
    local npm_mb=$(( $(bytes_of /root/.npm) / 1024 / 1024 ))
    if (( npm_mb > 200 )); then
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY-RUN would run npm cache clean --force (before ${npm_mb}MB)"
      else
        log "RUN npm cache clean --force (before ${npm_mb}MB)"
        npm cache clean --force >/dev/null 2>&1 || log "WARN npm cache clean failed"
      fi
    fi
  fi
}

prune_apt_cache() {
  if [[ -d /var/cache/apt/archives ]]; then
    local apt_mb=$(( $(bytes_of /var/cache/apt/archives) / 1024 / 1024 ))
    if (( apt_mb > 50 )); then
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY-RUN would run apt-get clean (before ${apt_mb}MB)"
      else
        log "RUN apt-get clean (before ${apt_mb}MB)"
        apt-get clean >/dev/null 2>&1 || log "WARN apt-get clean failed"
      fi
    fi
  fi
}

vacuum_journal() {
  local usage_mb
  usage_mb="$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[MG]' | head -1 || echo 0)"
  log "journal usage before: $usage_mb"

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY-RUN would vacuum journal to ${JOURNAL_MAX_MB}M"
  else
    journalctl --vacuum-size="${JOURNAL_MAX_MB}M" >/dev/null 2>&1 || log "WARN journal vacuum failed"
  fi

  usage_mb="$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[MG]' | head -1 || echo 0)"
  log "journal usage after: $usage_mb"
}

main() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "SKIP already running"
    exit 0
  fi

  local before after freed mode_label
  before="$(df -Pk / | awk 'NR==2 {print $3}')"
  mode_label="live"
  if [[ "$DRY_RUN" == "1" ]]; then
    mode_label="dry-run"
  fi

  log "=== maintenance start mode=${mode_label} release_prune=${RELEASE_PRUNE_ENABLED} disk_used_kb=${before} ==="

  prune_cursor_sandbox_cache
  prune_old_releases
  prune_dev_next_cache
  prune_stale_tmp
  prune_rotated_logs
  prune_npm_cache
  prune_apt_cache
  vacuum_journal

  after="$(df -Pk / | awk 'NR==2 {print $3}')"
  freed=$(( (before - after) / 1024 ))
  log "=== maintenance done mode=${mode_label} disk_freed_mb~=${freed} current=$(df -h / | awk 'NR==2 {print $5" used, "$4" free"}') ==="

  if [[ -d "$DEPLOY_ROOT" ]]; then
    log "current=$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || echo missing)"
    log "previous=$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || echo missing)"
  fi
}

main "$@"
