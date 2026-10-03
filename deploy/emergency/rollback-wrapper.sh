#!/usr/bin/env bash
# Fixed rollback entry. Install target (not performed here):
#   /usr/local/sbin/audiolad-rollback
# Invokes the current release's canonical rollback.sh with a fixed reason.
# No caller-supplied reason, path, or shell.
set -euo pipefail

if [[ $# -ne 0 ]]; then
  printf 'ERROR: audiolad-rollback takes no arguments\n' >&2
  exit 1
fi

if [[ "${AUDIOLAD_EMERGENCY_TEST:-}" == "1" ]]; then
  DEPLOY_ROOT="${DEPLOY_ROOT:?DEPLOY_ROOT is required in test mode}"
  case "$DEPLOY_ROOT" in
    /tmp/*|/var/tmp/*) ;;
    *)
      printf 'ERROR: test mode refuses DEPLOY_ROOT outside /tmp\n' >&2
      exit 1
      ;;
  esac
else
  DEPLOY_ROOT=/var/www/audiolad-deploy
fi

if [[ ! -L "$DEPLOY_ROOT/current" ]]; then
  printf 'ERROR: %s/current is not a symlink\n' "$DEPLOY_ROOT" >&2
  exit 1
fi

release="$(readlink -f "$DEPLOY_ROOT/current")"
case "$release" in
  "$DEPLOY_ROOT"/releases/*) ;;
  *)
    printf 'ERROR: current release is outside %s/releases\n' "$DEPLOY_ROOT" >&2
    exit 1
    ;;
esac

rollback="${release}/deploy/scripts/rollback.sh"
if [[ ! -f "$rollback" || ! -x "$rollback" ]]; then
  printf 'ERROR: canonical rollback.sh is missing in the current release\n' >&2
  exit 1
fi

exec "$rollback" "emergency rollback via audiolad-rollback"
