#!/bin/bash
# Draft privileged Audiolad maintenance apply wrapper.
# Intended install path: /usr/local/sbin/audiolad-maintenance-apply
# (root:root, 0755). This file is NOT installed by merging to main, CI,
# or OPS_MAINTENANCE_* jobs.
#
# Accepts NO arguments. No arbitrary command, path, or remote shell.
# Runs only the installed canonical maintenance script with hardcoded --apply.
# Never invokes audiolad-deploy. Never restarts PM2/nginx/Docker. Never cutover.
set -Eeuo pipefail

if [[ $# -ne 0 ]]; then
  printf 'ERROR: audiolad-maintenance-apply accepts no arguments.\n' >&2
  exit 1
fi

PATH=/usr/sbin:/usr/bin:/bin
export PATH
unset BASH_ENV || true
unset ENV || true
unset CDPATH || true
hash -r 2>/dev/null || true

# Ignore caller env that could widen or redirect cleanup.
unset DEPLOY_ROOT || true
unset GIT_WORKDIR || true
unset KEEP_EXTRA_RELEASES || true
unset RELEASE_PRUNE_ENABLED || true
unset RELEASE_RETENTION_KEEP_EXTRA || true
unset RELEASE_RETENTION_MIN_AGE_SECONDS || true
unset RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS || true
unset RELEASE_RETENTION_DRY_RUN || true
unset RELEASE_RETENTION_EMERGENCY || true
unset DRY_RUN || true
unset DRY_RUN_ENV_FORCE || true
unset CURSOR_CACHE_MAX_MB || true
unset CURSOR_CACHE_MAX_AGE_DAYS || true
unset CURSOR_CACHE_EMERGENCY_AGE_DAYS || true
unset TMP_CACHE_MAX_AGE_SECONDS || true
unset TMP_AUDIOLAD_MAX_AGE_DAYS || true
unset TMP_CLEANUP_ENABLED || true
unset HOST_CACHE_CLEANUP_ENABLED || true
unset WORKTREE_PRUNE_ENABLED || true
unset WORKTREE_ORPHAN_AGE_SECONDS || true
unset EMERGENCY_FREE_KB || true
unset EMERGENCY_USED_PCT || true
unset CLEANUP_LOCK_FILE || true
unset DEPLOY_LOCK_FILE || true
unset LOCK_FILE || true
unset JOURNAL_MAX_MB || true

# Canonical installed policy. Same extras as the systemd unit.
export KEEP_EXTRA_RELEASES=1
export RELEASE_PRUNE_ENABLED=1
export RELEASE_RETENTION_MIN_AGE_SECONDS=1800
export RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS=7200
export WORKTREE_PRUNE_ENABLED=1

exec /usr/local/lib/audiolad/audiolad-maintenance.sh --apply
