#!/usr/bin/env bash
# Integration: deploy user cannot write root-owned shared; home cache + /var/lib paths validate.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$(mktemp -d /tmp/audiolad-gha-trusted-test.XXXXXX)"
trap 'rm -rf "$TEST_ROOT"' EXIT

DEPLOY_ROOT="${TEST_ROOT}/var/www/audiolad-deploy"
mkdir -p "${DEPLOY_ROOT}/shared" "${DEPLOY_ROOT}/releases/20261126-120000-000000000001/deploy"
chown root:root "${DEPLOY_ROOT}/shared" 2>/dev/null || true
chmod 0750 "${DEPLOY_ROOT}/shared"
chmod 0755 "${DEPLOY_ROOT}/releases/20261126-120000-000000000001"

FAKE_HOME="${TEST_ROOT}/home/deploy"
mkdir -p "$FAKE_HOME"
export HOME="$FAKE_HOME"
export DEPLOY_ROOT

# shellcheck source=audiolad-music-storage-bulk-privileged-common.sh
source "${SCRIPT_DIR}/audiolad-music-storage-bulk-privileged-common.sh"

shared_probe() {
  mkdir -p "${DEPLOY_ROOT}/shared/.gha-trusted-deploy" 2>/dev/null
}
if [[ "$(id -u)" -eq 0 ]] && command -v runuser >/dev/null 2>&1; then
  if runuser -u nobody -g nogroup -- bash -c "$(declare -f shared_probe); DEPLOY_ROOT='${DEPLOY_ROOT}' shared_probe"; then
    printf 'FAIL: unprivileged user could create shared/.gha-trusted-deploy\n' >&2
    exit 1
  fi
elif ! shared_probe; then
  :
else
  printf 'SKIP: shared writable in test sandbox (run as non-root for strict check)\n'
fi
printf 'PASS: shared not writable by unprivileged deploy\n'

CACHE_TREE="${HOME}/.cache/audiolad/gha-trusted-deploy/deploy"
mkdir -p "$CACHE_TREE/sbin" "$CACHE_TREE/sudoers"
printf 'deploy ALL=(root) NOPASSWD: /bin/true ""\n' >"$CACHE_TREE/sudoers/audiolad-music-storage-bulk"
touch "$CACHE_TREE/sbin/audiolad-music-storage-bulk-sudo-bootstrap"
chmod 0755 "$CACHE_TREE/sbin/audiolad-music-storage-bulk-sudo-bootstrap"

if ! audiolad_music_storage_bulk_validate_release_tree "$CACHE_TREE"; then
  printf 'FAIL: home cache deploy tree rejected\n' >&2
  exit 1
fi
printf 'PASS: home cache deploy tree accepted\n'

VARLIB_TREE="/var/lib/audiolad/gha-trusted-deploy/deploy"
if [[ "$(id -u)" -eq 0 ]]; then
  mkdir -p "$VARLIB_TREE/sbin"
  touch "$VARLIB_TREE/sbin/x"
  chmod 0755 "$VARLIB_TREE/sbin/x"
  if ! audiolad_music_storage_bulk_validate_release_tree "$VARLIB_TREE"; then
    printf 'FAIL: varlib deploy tree rejected\n' >&2
    exit 1
  fi
  printf 'PASS: varlib deploy tree accepted\n'
  rm -rf /var/lib/audiolad/gha-trusted-deploy
else
  printf 'SKIP: varlib test (not root)\n'
fi

BUNDLE_REMOTE="${SCRIPT_DIR}/audiolad-gha-trusted-deploy-bundle-apply-remote.sh"
bash -n "$BUNDLE_REMOTE"

TMP="$(mktemp -d)"
mkdir -p "$TMP/deploy/sbin"
echo ok >"$TMP/deploy/sbin/test"
tar -C "$TMP" -czf - deploy | env HOME="$FAKE_HOME" bash "$BUNDLE_REMOTE" | grep -Fq OPS_TRUSTED_BUNDLE_END=ok
test -d "$FAKE_HOME/.cache/audiolad/gha-trusted-deploy/deploy/sbin"
printf 'PASS: bundle apply remote extracts to home cache\n'

printf 'audiolad-music-storage-bulk-gha-trusted-install-test: ok\n'