#!/usr/bin/env bash
# Audiolad production disk hygiene — safe, idempotent, no service restarts.
# Logs go to stdout/stderr → journald (SyslogIdentifier=audiolad-maintenance).
#
# Usage:
#   audiolad-maintenance.sh --dry-run
#   audiolad-maintenance.sh --apply
# Without --apply the script never deletes (dry-run).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
resolve_retention_lib() {
  if [[ -f "$SCRIPT_DIR/lib/release-retention.sh" ]]; then
    printf '%s\n' "$SCRIPT_DIR/lib/release-retention.sh"
  elif [[ -f "$SCRIPT_DIR/release-retention.sh" ]]; then
    printf '%s\n' "$SCRIPT_DIR/release-retention.sh"
  else
    return 1
  fi
}

# Use :- only when unset; empty string must remain invalid.
if [[ ! -v DEPLOY_ROOT ]]; then
  DEPLOY_ROOT="/var/www/audiolad-deploy"
fi
if [[ ! -v GIT_WORKDIR ]]; then
  GIT_WORKDIR="/var/www/audiolad"
fi
CLEANUP_LOCK_FILE="${CLEANUP_LOCK_FILE:-/run/audiolad-disk-cleanup.lock}"
# Back-compat alias used by older tests/docs.
LOCK_FILE="${LOCK_FILE:-$CLEANUP_LOCK_FILE}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/run/audiolad-deploy.lock}"

KEEP_EXTRA_RELEASES="${KEEP_EXTRA_RELEASES:-1}"
RELEASE_PRUNE_ENABLED="${RELEASE_PRUNE_ENABLED:-1}"
RELEASE_RETENTION_MIN_AGE_SECONDS="${RELEASE_RETENTION_MIN_AGE_SECONDS:-1800}"
RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS="${RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS:-7200}"

CURSOR_CACHE_DIR="/tmp/cursor-sandbox-cache"
CURSOR_CACHE_MAX_MB="${CURSOR_CACHE_MAX_MB:-2048}"
CURSOR_CACHE_MAX_AGE_DAYS="${CURSOR_CACHE_MAX_AGE_DAYS:-1}"
CURSOR_CACHE_EMERGENCY_AGE_DAYS="${CURSOR_CACHE_EMERGENCY_AGE_DAYS:-0}"

NODE_COMPILE_CACHE_DIR="/tmp/node-compile-cache"
TMP_CACHE_MAX_AGE_SECONDS="${TMP_CACHE_MAX_AGE_SECONDS:-86400}"

JOURNAL_MAX_MB="${JOURNAL_MAX_MB:-150}"
TMP_AUDIOLAD_MAX_AGE_DAYS="${TMP_AUDIOLAD_MAX_AGE_DAYS:-7}"

WORKTREES_ROOT_NAME=".worktrees"
WORKTREE_ORPHAN_AGE_SECONDS="${WORKTREE_ORPHAN_AGE_SECONDS:-172800}"
WORKTREE_PRUNE_ENABLED="${WORKTREE_PRUNE_ENABLED:-1}"
TMP_CLEANUP_ENABLED="${TMP_CLEANUP_ENABLED:-1}"
HOST_CACHE_CLEANUP_ENABLED="${HOST_CACHE_CLEANUP_ENABLED:-1}"

EMERGENCY_FREE_KB="${EMERGENCY_FREE_KB:-8388608}"   # 8 GiB
EMERGENCY_USED_PCT="${EMERGENCY_USED_PCT:-85}"

# Capture legacy env before defaults (tests historically export DRY_RUN=0).
LEGACY_DRY_RUN="${DRY_RUN-}"
DRY_RUN=1
RUN_MODE="dry-run"
RUN_STATUS="dry-run"
START_EPOCH=0
REMOVED_BYTES_TOTAL=0
EMERGENCY_MODE=0

usage() {
  cat <<'EOF'
Usage: audiolad-maintenance.sh [--dry-run|--apply]

  --dry-run   Show what would be removed (default; no deletes)
  --apply     Perform cleanup

Environment knobs:
  DEPLOY_ROOT, GIT_WORKDIR, KEEP_EXTRA_RELEASES
  RELEASE_RETENTION_MIN_AGE_SECONDS (default 1800)
  RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS (default 7200)
  TMP_CACHE_MAX_AGE_SECONDS (default 86400)
  WORKTREE_ORPHAN_AGE_SECONDS (default 172800)
  WORKTREE_PRUNE_ENABLED (default 1)
  RELEASE_PRUNE_ENABLED (default 1)
EOF
}

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

log_info() { log "$*"; }
log_warn() { log "WARN $*"; }
log_error() { log "ERROR $*"; }

require_absolute_dir() {
  local label="$1"
  local path="$2"

  if [[ -z "$path" || "$path" != /* ]]; then
    log_error "${label} must be an absolute path, got: ${path:-<empty>}"
    exit 1
  fi

  if [[ ! -d "$path" ]]; then
    log_error "${label} directory missing: $path"
    exit 1
  fi

  if [[ -L "$path" ]]; then
    log_error "${label} must not be a symlink: $path"
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

df_used_kb() { df -Pk / | awk 'NR==2 {print $3}'; }
df_avail_kb() { df -Pk / | awk 'NR==2 {print $4}'; }
df_used_pct() { df -Pk / | awk 'NR==2 {gsub(/%/,"",$5); print $5}'; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        RUN_MODE="dry-run"
        shift
        ;;
      --apply)
        DRY_RUN=0
        RUN_MODE="apply"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        log_error "Unknown argument: $1"
        usage
        exit 2
        ;;
    esac
  done

  # Legacy env override: DRY_RUN=1 forces dry-run even with --apply.
  if [[ "${DRY_RUN_ENV_FORCE:-}" == "1" ]]; then
    DRY_RUN=1
    RUN_MODE="dry-run"
  fi
  # Honor legacy DRY_RUN=1 when no CLI apply was intended via env-only invocations.
  if [[ "${DRY_RUN:-}" == "1" && "$RUN_MODE" != "apply" ]]; then
    DRY_RUN=1
    RUN_MODE="dry-run"
  fi
}

age_seconds_of() {
  local path="$1"
  local now mtime
  now="$(date +%s)"
  mtime="$(stat -c '%Y' "$path" 2>/dev/null || echo "$now")"
  echo $((now - mtime))
}

safe_remove_path() {
  local path="$1"
  local allowed_root="$2"
  local reason="$3"
  local real_path real_root

  if [[ -z "$path" || "$path" == "/" || "$path" != /* ]]; then
    log_error "Refusing unsafe path: ${path:-<empty>}"
    return 1
  fi

  if [[ -z "$allowed_root" || "$allowed_root" == "/" || "$allowed_root" != /* ]]; then
    log_error "Refusing unsafe allowed_root: ${allowed_root:-<empty>}"
    return 1
  fi

  if [[ ! -e "$path" ]]; then
    return 0
  fi

  real_path="$(readlink -f "$path" 2>/dev/null || true)"
  real_root="$(readlink -f "$allowed_root" 2>/dev/null || true)"

  if [[ -z "$real_path" || -z "$real_root" ]]; then
    log_warn "SKIP unresolved path: $path"
    return 1
  fi

  if [[ "$real_path" == "/" || "$real_root" == "/" ]]; then
    log_error "Refusing delete at filesystem root"
    return 1
  fi

  if [[ "$real_path" != "$real_root" && "$real_path" != "$real_root"/* ]]; then
    log_warn "SKIP path outside allowed root ($real_root): $real_path"
    return 1
  fi

  # Never follow a top-level symlink out of the root; delete only real children.
  if [[ -L "$path" ]]; then
    local link_target
    link_target="$(readlink -f "$path" 2>/dev/null || true)"
    if [[ -z "$link_target" || ( "$link_target" != "$real_root" && "$link_target" != "$real_root"/* ) ]]; then
      log_warn "SKIP symlink escaping allowed root: $path -> $link_target"
      return 1
    fi
  fi

  local size_bytes
  size_bytes="$(bytes_of "$real_path")"

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY-RUN would remove ($reason) size=$(human_of "$real_path") path=$real_path"
    REMOVED_BYTES_TOTAL=$((REMOVED_BYTES_TOTAL + size_bytes))
    return 0
  fi

  rm -rf --one-file-system "$real_path"
  REMOVED_BYTES_TOTAL=$((REMOVED_BYTES_TOTAL + size_bytes))
  log "REMOVE ($reason) size_bytes=$size_bytes path=$real_path"
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
  local root="$1"
  OPEN_PATHS=()
  [[ -d "$root" && ! -L "$root" ]] || return 0

  mapfile -t OPEN_PATHS < <(
    lsof +D "$root" 2>/dev/null | awk 'NR>1 {print $NF}' | sort -u || true
  )
}

path_has_active_process() {
  local target="$1"
  if [[ "${RELEASE_RETENTION_SKIP_LSOF:-0}" == "1" ]]; then
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    if timeout 2s lsof +D "$target" 2>/dev/null | awk 'NR>1 {found=1} END {exit found?0:1}'; then
      return 0
    fi
  fi
  if command -v fuser >/dev/null 2>&1; then
    if timeout 2s fuser -s "$target" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

detect_emergency_mode() {
  local avail used_pct
  avail="$(df_avail_kb)"
  used_pct="$(df_used_pct)"
  EMERGENCY_MODE=0
  if (( avail < EMERGENCY_FREE_KB )) || (( used_pct >= EMERGENCY_USED_PCT )); then
    EMERGENCY_MODE=1
    log "Emergency disk mode enabled avail_kb=$avail used_pct=${used_pct}% thresholds: free<${EMERGENCY_FREE_KB}KB or used>=${EMERGENCY_USED_PCT}%"
  else
    log "Normal disk mode avail_kb=$avail used_pct=${used_pct}%"
  fi
  export RELEASE_RETENTION_EMERGENCY="$EMERGENCY_MODE"
}

acquire_locks_or_skip() {
  mkdir -p "$(dirname "$LOCK_FILE")"
  mkdir -p "$(dirname "$DEPLOY_LOCK_FILE")"

  exec 9>>"$LOCK_FILE"
  if ! flock -n 9; then
    log "SKIP already running (cleanup lock held: $LOCK_FILE)"
    RUN_STATUS="skipped-cleanup-lock"
    exit 0
  fi

  exec 8>>"$DEPLOY_LOCK_FILE"
  if ! flock -n 8; then
    log "SKIP cleanup because deploy lock is held ($DEPLOY_LOCK_FILE)"
    RUN_STATUS="skipped-deploy-lock"
    exit 0
  fi

  log "Acquired cleanup lock=$LOCK_FILE and deploy lock=$DEPLOY_LOCK_FILE"
}

prune_releases() {
  if [[ "$RELEASE_PRUNE_ENABLED" != "1" ]]; then
    log "SKIP release prune (RELEASE_PRUNE_ENABLED=0)"
    return 0
  fi

  local retention_lib
  retention_lib="$(resolve_retention_lib)" || {
    log_error "release-retention.sh not found near $SCRIPT_DIR"
    return 1
  }
  # shellcheck source=lib/release-retention.sh
  source "$retention_lib"

  export RELEASE_RETENTION_KEEP_EXTRA="$KEEP_EXTRA_RELEASES"
  export RELEASE_RETENTION_MIN_AGE_SECONDS
  export RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS
  export RELEASE_RETENTION_DRY_RUN="$DRY_RUN"
  export RELEASE_RETENTION_EMERGENCY="${EMERGENCY_MODE:-0}"
  export DEPLOY_ROOT

  local before_count
  before_count="$(find "$DEPLOY_ROOT/releases" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
  log "Releases before prune: $before_count"

  prune_old_releases "$KEEP_EXTRA_RELEASES"

  local after_count
  after_count="$(find "$DEPLOY_ROOT/releases" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
  REMOVED_BYTES_TOTAL=$((REMOVED_BYTES_TOTAL + ${RELEASE_RETENTION_REMOVED_BYTES:-0}))
  log "Releases after prune: $after_count"
}

prune_cursor_sandbox_cache() {
  if [[ "$TMP_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP cursor cache (TMP_CLEANUP_ENABLED=0)"
    return 0
  fi
  if [[ ! -d "$CURSOR_CACHE_DIR" || -L "$CURSOR_CACHE_DIR" ]]; then
    log "SKIP cursor cache (missing or symlink): $CURSOR_CACHE_DIR"
    return 0
  fi

  local real_cache_dir
  real_cache_dir="$(readlink -f "$CURSOR_CACHE_DIR" 2>/dev/null || true)"
  if [[ "$real_cache_dir" != "/tmp/cursor-sandbox-cache" ]]; then
    log_error "cursor cache resolved outside expected path: $real_cache_dir"
    return 1
  fi

  load_open_paths "$real_cache_dir"
  local before_mb max_age_days
  before_mb=$(( $(bytes_of "$real_cache_dir") / 1024 / 1024 ))
  max_age_days="$CURSOR_CACHE_MAX_AGE_DAYS"

  if (( before_mb > CURSOR_CACHE_MAX_MB )) || [[ "${EMERGENCY_MODE:-0}" == "1" ]]; then
    max_age_days="$CURSOR_CACHE_EMERGENCY_AGE_DAYS"
    log "cursor-sandbox-cache emergency mode: size=${before_mb}MB, age>${max_age_days}d"
  else
    log "cursor-sandbox-cache normal mode: size=${before_mb}MB, age>${max_age_days}d"
  fi

  while IFS= read -r -d '' entry; do
    if is_path_open "$entry"; then
      log "SKIP open cursor cache entry: $entry"
      continue
    fi
    safe_remove_path "$entry" "$real_cache_dir" "aged cursor cache"
  done < <(find "$real_cache_dir" -mindepth 1 -xdev -mtime "+${max_age_days}" -print0 2>/dev/null)

  while (( $(bytes_of "$real_cache_dir") / 1024 / 1024 > CURSOR_CACHE_MAX_MB )); do
    local oldest=""
    while IFS= read -r candidate; do
      [[ -n "$candidate" && "$candidate" != "$real_cache_dir" ]] || continue
      if is_path_open "$candidate"; then
        continue
      fi
      oldest="$candidate"
      break
    done < <(find "$real_cache_dir" -mindepth 1 -xdev -printf '%T+ %p\n' 2>/dev/null | sort | awk '{ $1=""; sub(/^ /,""); print }')

    [[ -n "$oldest" ]] || break
    safe_remove_path "$oldest" "$real_cache_dir" "oldest cursor cache"
  done

  log "cursor-sandbox-cache after=$(human_of "$real_cache_dir")"
}

prune_node_compile_cache() {
  if [[ "$TMP_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP node-compile-cache (TMP_CLEANUP_ENABLED=0)"
    return 0
  fi
  if [[ ! -d "$NODE_COMPILE_CACHE_DIR" || -L "$NODE_COMPILE_CACHE_DIR" ]]; then
    log "SKIP node-compile-cache (missing or symlink)"
    return 0
  fi

  local real_dir
  real_dir="$(readlink -f "$NODE_COMPILE_CACHE_DIR" 2>/dev/null || true)"
  if [[ "$real_dir" != "/tmp/node-compile-cache" ]]; then
    log_warn "SKIP unexpected node-compile-cache path: $real_dir"
    return 0
  fi

  load_open_paths "$real_dir"
  local cutoff
  cutoff=$(( $(date +%s) - TMP_CACHE_MAX_AGE_SECONDS ))

  while IFS= read -r -d '' entry; do
    local mtime
    mtime="$(stat -c '%Y' "$entry" 2>/dev/null || echo 0)"
    if (( mtime > cutoff )); then
      continue
    fi
    if is_path_open "$entry"; then
      log "SKIP open node-compile-cache entry: $entry"
      continue
    fi
    safe_remove_path "$entry" "$real_dir" "aged node-compile-cache"
  done < <(find "$real_dir" -mindepth 1 -xdev -print0 2>/dev/null)
}

prune_stale_tmp() {
  if [[ "$TMP_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP stale tmp (TMP_CLEANUP_ENABLED=0)"
    return 0
  fi
  # Only known audiolad/playwright temp dirs, never whole /tmp.
  find /tmp -maxdepth 1 -xdev -type d \( -name 'audiolad-deploy-lock-*' -o -name 'playwright-artifacts-*' -o -name 'playwright_chromiumdev_profile-*' -o -name 'playwright_webkitdev_profile-*' \) -mtime "+${TMP_AUDIOLAD_MAX_AGE_DAYS}" -print0 2>/dev/null |
    while IFS= read -r -d '' dir; do
      if path_has_active_process "$dir"; then
        log "SKIP open tmp dir: $dir"
        continue
      fi
      # Never remove registered git worktrees under /tmp.
      if [[ -f "$dir/.git" ]] || [[ -d "$dir/.git" ]]; then
        log "SKIP tmp git worktree: $dir"
        continue
      fi
      safe_remove_path "$dir" "/tmp" "stale tmp"
    done
}

prune_dev_next_cache() {
  if [[ "$HOST_CACHE_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP dev .next (HOST_CACHE_CLEANUP_ENABLED=0)"
    return 0
  fi
  local next_dir="$GIT_WORKDIR/.next"
  if [[ -d "$next_dir" && ! -L "$next_dir" ]]; then
    safe_remove_path "$next_dir" "$GIT_WORKDIR" "dev .next"
  fi
}

prune_orphaned_worktrees() {
  if [[ "$WORKTREE_PRUNE_ENABLED" != "1" ]]; then
    log "SKIP worktree orphan prune (WORKTREE_PRUNE_ENABLED=0)"
    return 0
  fi

  local wt_root="$GIT_WORKDIR/$WORKTREES_ROOT_NAME"
  if [[ ! -d "$wt_root" || -L "$wt_root" ]]; then
    log "SKIP worktrees root missing: $wt_root"
    return 0
  fi

  if [[ ! -d "$GIT_WORKDIR/.git" && ! -f "$GIT_WORKDIR/.git" ]]; then
    log_warn "SKIP worktree prune: GIT_WORKDIR is not a git checkout"
    return 0
  fi

  declare -A REGISTERED=()
  local line path
  while IFS= read -r line; do
    if [[ "$line" == worktree\ * ]]; then
      path="${line#worktree }"
      path="$(readlink -f "$path" 2>/dev/null || true)"
      [[ -n "$path" ]] && REGISTERED["$path"]=1
    fi
  done < <(git -C "$GIT_WORKDIR" worktree list --porcelain 2>/dev/null || true)

  log "Registered git worktrees: ${#REGISTERED[@]}"

  local entry real_entry age size
  while IFS= read -r -d '' entry; do
    real_entry="$(readlink -f "$entry" 2>/dev/null || true)"
    [[ -n "$real_entry" ]] || continue

    if [[ -n "${REGISTERED[$real_entry]:-}" ]]; then
      log "KEEP registered worktree: $real_entry"
      continue
    fi

    age="$(age_seconds_of "$real_entry")"
    size="$(human_of "$real_entry")"

    if (( age < WORKTREE_ORPHAN_AGE_SECONDS )); then
      log "WARN orphan-candidate too young (age=${age}s): size=$size path=$real_entry"
      continue
    fi

    if path_has_active_process "$real_entry"; then
      log "WARN orphan-candidate has active process: size=$size path=$real_entry"
      continue
    fi

    log "ORPHAN worktree reason=unregistered+age=${age}s+no-open-files size=$size path=$real_entry"
    safe_remove_path "$real_entry" "$wt_root" "orphaned worktree"
  done < <(find "$wt_root" -mindepth 1 -maxdepth 1 -xdev -print0 2>/dev/null)

  # Safe prune of stale git worktree metadata only (does not delete files).
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY-RUN would run: git -C $GIT_WORKDIR worktree prune -n"
    git -C "$GIT_WORKDIR" worktree prune -n 2>/dev/null | while IFS= read -r line; do
      log "DRY-RUN worktree prune: $line"
    done || true
  else
    git -C "$GIT_WORKDIR" worktree prune 2>/dev/null || log_warn "git worktree prune failed"
  fi
}

prune_rotated_logs() {
  if [[ "$HOST_CACHE_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP rotated logs (HOST_CACHE_CLEANUP_ENABLED=0)"
    return 0
  fi
  find /var/log/nginx -xdev -type f \( -name '*.gz' -o -name '*.1' -o -name '*.2' \) -mtime +14 -print0 2>/dev/null |
    while IFS= read -r -d '' file; do
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY-RUN would remove rotated nginx log: $file"
      else
        rm -f "$file"
        log "REMOVE rotated nginx log: $file"
      fi
    done

  find /var/log -xdev -maxdepth 1 -type f \( -name 'auth.log.*' -o -name 'syslog.*' -o -name 'btmp' -o -name 'btmp.1' \) -mtime +14 -print0 2>/dev/null |
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
  if [[ "$HOST_CACHE_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP npm cache (HOST_CACHE_CLEANUP_ENABLED=0)"
    return 0
  fi
  if [[ -d /root/.npm ]]; then
    local npm_mb=$(( $(bytes_of /root/.npm) / 1024 / 1024 ))
    if (( npm_mb > 200 )); then
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY-RUN would run npm cache clean --force (before ${npm_mb}MB)"
      else
        log "RUN npm cache clean --force (before ${npm_mb}MB)"
        npm cache clean --force >/dev/null 2>&1 || log_warn "npm cache clean failed"
      fi
    fi
  fi
}

prune_apt_cache() {
  if [[ "$HOST_CACHE_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP apt cache (HOST_CACHE_CLEANUP_ENABLED=0)"
    return 0
  fi
  if [[ -d /var/cache/apt/archives ]]; then
    local apt_mb=$(( $(bytes_of /var/cache/apt/archives) / 1024 / 1024 ))
    if (( apt_mb > 50 )); then
      if [[ "$DRY_RUN" == "1" ]]; then
        log "DRY-RUN would run apt-get clean (before ${apt_mb}MB)"
      else
        log "RUN apt-get clean (before ${apt_mb}MB)"
        apt-get clean >/dev/null 2>&1 || log_warn "apt-get clean failed"
      fi
    fi
  fi
}

vacuum_journal() {
  if [[ "$HOST_CACHE_CLEANUP_ENABLED" != "1" ]]; then
    log "SKIP journal vacuum (HOST_CACHE_CLEANUP_ENABLED=0)"
    return 0
  fi
  local usage_mb
  usage_mb="$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[MG]' | head -1 || echo 0)"
  log "journal usage before: $usage_mb"

  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY-RUN would vacuum journal to ${JOURNAL_MAX_MB}M"
  else
    journalctl --vacuum-size="${JOURNAL_MAX_MB}M" >/dev/null 2>&1 || log_warn "journal vacuum failed"
  fi

  usage_mb="$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[MG]' | head -1 || echo 0)"
  log "journal usage after: $usage_mb"
}

main() {
  if [[ $# -gt 0 ]]; then
    parse_args "$@"
  else
    # No CLI flags: safe default is dry-run unless legacy DRY_RUN=0 is exported.
    if [[ "$LEGACY_DRY_RUN" == "0" ]]; then
      DRY_RUN=0
      RUN_MODE="apply"
    else
      DRY_RUN=1
      RUN_MODE="dry-run"
    fi
  fi

  START_EPOCH="$(date +%s)"
  RUN_STATUS="$RUN_MODE"

  if [[ -z "$DEPLOY_ROOT" || "$DEPLOY_ROOT" != /* ]]; then
    log_error "DEPLOY_ROOT must be an absolute path, got: ${DEPLOY_ROOT:-<empty>}"
    exit 1
  fi
  DEPLOY_ROOT="$(readlink -f "$DEPLOY_ROOT")"
  require_absolute_dir "DEPLOY_ROOT" "$DEPLOY_ROOT"
  require_absolute_dir "releases" "$DEPLOY_ROOT/releases"

  acquire_locks_or_skip

  local before_used before_avail before_releases
  before_used="$(df_used_kb)"
  before_avail="$(df_avail_kb)"
  before_releases="$(find "$DEPLOY_ROOT/releases" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"

  detect_emergency_mode

  log "=== maintenance start mode=${RUN_MODE} emergency=${EMERGENCY_MODE:-0} release_prune=${RELEASE_PRUNE_ENABLED} disk_used_kb=${before_used} disk_avail_kb=${before_avail} releases=${before_releases} ==="
  log "current=$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || echo missing)"
  log "previous=$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || echo missing)"

  prune_cursor_sandbox_cache
  prune_node_compile_cache
  prune_releases
  prune_orphaned_worktrees
  prune_dev_next_cache
  prune_stale_tmp
  prune_rotated_logs
  prune_npm_cache
  prune_apt_cache
  vacuum_journal

  local after_used after_avail after_releases duration
  after_used="$(df_used_kb)"
  after_avail="$(df_avail_kb)"
  after_releases="$(find "$DEPLOY_ROOT/releases" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
  duration=$(( $(date +%s) - START_EPOCH ))

  if [[ "$RUN_MODE" == "apply" ]]; then
    RUN_STATUS="completed"
  else
    RUN_STATUS="dry-run"
  fi

  log "=== maintenance done status=${RUN_STATUS} mode=${RUN_MODE} duration_s=${duration} removed_bytes~=${REMOVED_BYTES_TOTAL} disk_before_avail_kb=${before_avail} disk_after_avail_kb=${after_avail} disk_freed_kb~=$(( before_used - after_used )) releases_before=${before_releases} releases_after=${after_releases} current=$(df -h / | awk 'NR==2 {print $5" used, "$4" free"}') ==="
  log "current=$(readlink -f "$DEPLOY_ROOT/current" 2>/dev/null || echo missing)"
  log "previous=$(readlink -f "$DEPLOY_ROOT/previous" 2>/dev/null || echo missing)"
}

main "$@"
