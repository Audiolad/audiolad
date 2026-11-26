#!/usr/bin/env bash
# Install /usr/local/sbin wrappers + sudoers + pinned lib copies for GHA ops.
# Root only. Safe to re-run (idempotent file install + visudo).
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
DEPLOY_TREE="${DEPLOY_TREE:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=audiolad-music-storage-bulk-privileged-common.sh
source "${SCRIPT_DIR}/audiolad-music-storage-bulk-privileged-common.sh"

if [[ "$(id -u)" -ne 0 && -z "${AUDIOLAD_MUSIC_STORAGE_BULK_TEST_ROOT:-}" ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

if [[ -z "$DEPLOY_TREE" ]]; then
  CURRENT="$(readlink -f "${DEPLOY_ROOT}/current")"
  DEPLOY_TREE="${CURRENT}/deploy"
fi

if ! audiolad_music_storage_bulk_validate_release_tree "$(dirname "$DEPLOY_TREE")"; then
  exit 1
fi

TEST_ROOT="${AUDIOLAD_MUSIC_STORAGE_BULK_TEST_ROOT:-}"
SBIN_DEST_PREFIX="${TEST_ROOT}"
if [[ -n "$TEST_ROOT" ]]; then
  LIB_DIR="${AUDIOLAD_LIB_DIR:-${TEST_ROOT}/usr/local/lib/audiolad}"
  SUDOERS_DST="${TEST_ROOT}/etc/sudoers.d/audiolad-music-storage-bulk"
else
  LIB_DIR="${AUDIOLAD_LIB_DIR:-/usr/local/lib/audiolad}"
  SUDOERS_DST="/etc/sudoers.d/audiolad-music-storage-bulk"
fi

SBIN_SRC="${DEPLOY_TREE}/sbin"
SUDOERS_SRC="${DEPLOY_TREE}/sudoers/audiolad-music-storage-bulk"
ROOT_INSTALL_SRC="${DEPLOY_TREE}/scripts/audiolad-music-storage-bulk-root-install.sh"
BOOTSTRAP_SRC="${DEPLOY_TREE}/scripts/audiolad-music-storage-bulk-sudo-bootstrap.sh"

if [[ ! -d "$SBIN_SRC" ]]; then
  printf '%s\n' '{"error":"sbin_source_missing"}' >&2
  exit 1
fi
if [[ ! -f "$SUDOERS_SRC" ]]; then
  printf '%s\n' '{"error":"sudoers_source_missing"}' >&2
  exit 1
fi

for required in "$ROOT_INSTALL_SRC" "$BOOTSTRAP_SRC"; do
  if ! audiolad_music_storage_bulk_validate_regular_file "$required"; then
    exit 1
  fi
done

install -d -m 0755 "$LIB_DIR"
mkdir -p "${SBIN_DEST_PREFIX}/usr/local/sbin"
if [[ -n "${AUDIOLAD_MUSIC_STORAGE_BULK_TEST_ROOT:-}" ]]; then
  install -m 0755 "$ROOT_INSTALL_SRC" "${LIB_DIR}/audiolad-music-storage-bulk-root-install.sh"
  install -m 0755 "$BOOTSTRAP_SRC" "${LIB_DIR}/audiolad-music-storage-bulk-sudo-bootstrap-pinned.sh"
  install -m 0755 "${DEPLOY_TREE}/scripts/audiolad-music-storage-bulk-privileged-common.sh" \
    "${LIB_DIR}/audiolad-music-storage-bulk-privileged-common.sh"
else
  install -o root -g root -m 0755 "$ROOT_INSTALL_SRC" \
    "${LIB_DIR}/audiolad-music-storage-bulk-root-install.sh"
  install -o root -g root -m 0755 "$BOOTSTRAP_SRC" \
    "${LIB_DIR}/audiolad-music-storage-bulk-sudo-bootstrap-pinned.sh"
install -o root -g root -m 0755 "${DEPLOY_TREE}/scripts/audiolad-music-storage-bulk-privileged-common.sh" \
  "${LIB_DIR}/audiolad-music-storage-bulk-privileged-common.sh"
install -o root -g root -m 0755 "${DEPLOY_TREE}/scripts/audiolad-music-storage-bulk-enable-copy-env.sh" \
  "${LIB_DIR}/audiolad-music-storage-bulk-enable-copy-env.sh"
install -o root -g root -m 0755 "${DEPLOY_TREE}/scripts/audiolad-music-storage-bulk-ops-privileged-diag.sh" \
  "${LIB_DIR}/audiolad-music-storage-bulk-ops-privileged-diag.sh"
fi

for name in \
  audiolad-music-storage-bulk-sudo-bootstrap \
  audiolad-music-storage-bulk-install \
  audiolad-music-storage-bulk-ops-status \
  audiolad-music-storage-bulk-ops-start-copy \
  audiolad-music-storage-bulk-ops-pause \
  audiolad-music-storage-bulk-ops-stop \
  audiolad-music-storage-bulk-ops-resume \
  audiolad-music-storage-bulk-ops-diag; do
  src="${SBIN_SRC}/${name}"
  if ! audiolad_music_storage_bulk_validate_regular_file "$src"; then
    exit 1
  fi
  if [[ -n "${AUDIOLAD_MUSIC_STORAGE_BULK_TEST_ROOT:-}" ]]; then
    install -m 0755 "$src" "${SBIN_DEST_PREFIX}/usr/local/sbin/${name}"
  else
    install -o root -g root -m 0755 "$src" "${SBIN_DEST_PREFIX}/usr/local/sbin/${name}"
  fi
done

mkdir -p "$(dirname "$SUDOERS_DST")"
if [[ -n "${AUDIOLAD_MUSIC_STORAGE_BULK_TEST_ROOT:-}" ]]; then
  install -m 0440 "$SUDOERS_SRC" "$SUDOERS_DST"
else
  install -o root -g root -m 0440 "$SUDOERS_SRC" "$SUDOERS_DST"
fi
if [[ -n "${AUDIOLAD_MUSIC_STORAGE_BULK_TEST_ROOT:-}" ]]; then
  :
else
  visudo -cf "$SUDOERS_DST"
fi

printf '%s\n' "music_storage_bulk_sudo_bootstrap_ok"
printf '%s\n' "privileged_lib_dir=${LIB_DIR}"