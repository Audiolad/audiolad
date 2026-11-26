#!/usr/bin/env bash
# Non-production bootstrap integration: fake root prefix, no visudo on real /etc.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAKE_ROOT="$(mktemp -d /tmp/audiolad-mbs-bootstrap-test.XXXXXX)"
RELEASE="${FAKE_ROOT}/var/www/audiolad-deploy/releases/test-release"
trap 'rm -rf "${FAKE_ROOT}"' EXIT

mkdir -p "${RELEASE}/deploy/scripts"
cp -a "${ROOT}/deploy/sbin" "${RELEASE}/deploy/"
cp -a "${ROOT}/deploy/sudoers" "${RELEASE}/deploy/"
cp "${ROOT}/deploy/scripts/audiolad-music-storage-bulk-"*.sh "${RELEASE}/deploy/scripts/"

export AUDIOLAD_MUSIC_STORAGE_BULK_TEST_ROOT="${FAKE_ROOT}"
export DEPLOY_ROOT="${FAKE_ROOT}/var/www/audiolad-deploy"
export DEPLOY_TREE="${RELEASE}/deploy"
export AUDIOLAD_LIB_DIR="${FAKE_ROOT}/usr/local/lib/audiolad"

bash "${RELEASE}/deploy/scripts/audiolad-music-storage-bulk-sudo-bootstrap.sh" \
  | grep -q music_storage_bulk_sudo_bootstrap_ok

test -x "${FAKE_ROOT}/usr/local/sbin/audiolad-music-storage-bulk-install"
test -x "${FAKE_ROOT}/usr/local/lib/audiolad/audiolad-music-storage-bulk-root-install.sh"
test -s "${FAKE_ROOT}/etc/sudoers.d/audiolad-music-storage-bulk"

bash "${RELEASE}/deploy/scripts/audiolad-music-storage-bulk-sudo-bootstrap.sh" \
  | grep -q music_storage_bulk_sudo_bootstrap_ok

printf '%s\n' "music-storage-bulk-bootstrap-test: ok"