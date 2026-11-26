#!/usr/bin/env bash
# Install music-storage bulk orchestrator scripts + systemd units (root only).
# Does NOT set AUDIOLAD_MUSIC_STORAGE_BULK=1 or enable timers.
# Idempotent; does not chmod modes on existing system directories.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
LIB_DIR="${AUDIOLAD_LIB_DIR:-/usr/local/lib/audiolad}"
SYSTEMD_DIR="${AUDIOLAD_SYSTEMD_DIR:-/etc/systemd/system}"
ETC_AUDIOLAD="${AUDIOLAD_ETC_DIR:-/etc/audiolad}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=audiolad-music-storage-bulk-privileged-common.sh
source "${SCRIPT_DIR}/audiolad-music-storage-bulk-privileged-common.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

if [[ ! -L "$CURRENT_LINK" ]]; then
  printf '%s\n' '{"error":"current_release_missing"}' >&2
  exit 1
fi

CURRENT_DIR="$(readlink -f "$CURRENT_LINK")"
if ! audiolad_music_storage_bulk_validate_release_tree "$CURRENT_DIR"; then
  exit 1
fi

SRC="${CURRENT_DIR}/deploy"

ensure_dir() {
  local path="$1" mode="$2"
  if [[ ! -d "$path" ]]; then
    install -d -m "$mode" "$path"
  fi
}

ensure_dir "$LIB_DIR" 0755
ensure_dir "$ETC_AUDIOLAD" 0750

for file in \
  "${SRC}/scripts/audiolad-music-storage-bulk-orchestrator.sh" \
  "${SRC}/scripts/audiolad-music-storage-bulk-ctl.sh" \
  "${SRC}/scripts/audiolad-music-storage-bulk-ops-privileged.sh"; do
  if ! audiolad_music_storage_bulk_validate_regular_file "$file"; then
    exit 1
  fi
done

install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-orchestrator.sh" "${LIB_DIR}/"
install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-ctl.sh" "${LIB_DIR}/"
install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-ops-privileged.sh" "${LIB_DIR}/"
install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-enable-copy-env.sh" "${LIB_DIR}/"
install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-ops-privileged-diag.sh" "${LIB_DIR}/"

for unit in audiolad-music-storage-bulk-copy \
  audiolad-music-storage-bulk-cutover \
  audiolad-music-storage-bulk-release-local; do
  for f in "${SRC}/systemd/${unit}.service" "${SRC}/systemd/${unit}.timer"; do
    if ! audiolad_music_storage_bulk_validate_regular_file "$f"; then
      exit 1
    fi
  done
  install -m 0644 "${SRC}/systemd/${unit}.service" "${SYSTEMD_DIR}/${unit}.service"
  install -m 0644 "${SRC}/systemd/${unit}.timer" "${SYSTEMD_DIR}/${unit}.timer"
done

for example in music-storage-bulk-copy.env.example \
  music-storage-bulk-cutover.env.example \
  music-storage-bulk-release-local.env.example; do
  target="${ETC_AUDIOLAD}/${example%.example}"
  src_example="${SRC}/etc/audiolad/${example}"
  if ! audiolad_music_storage_bulk_validate_regular_file "$src_example"; then
    exit 1
  fi
  if [[ ! -f "$target" ]]; then
    install -m 0600 "$src_example" "$target"
  fi
done

systemctl daemon-reload

printf '%s\n' "music_storage_bulk_install_ok"
printf '%s\n' "lib_dir=${LIB_DIR}"
printf '%s\n' "next: review ${ETC_AUDIOLAD}/music-storage-bulk-copy.env, then OPS start or ctl start"