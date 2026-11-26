#!/usr/bin/env bash
# One-shot install of music-storage bulk orchestrator scripts + systemd units.
# Does NOT set AUDIOLAD_MUSIC_STORAGE_BULK=1 or enable timers (operator approval).
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
LIB_DIR="${AUDIOLAD_LIB_DIR:-/usr/local/lib/audiolad}"
SYSTEMD_DIR="${AUDIOLAD_SYSTEMD_DIR:-/etc/systemd/system}"
ETC_AUDIOLAD="${AUDIOLAD_ETC_DIR:-/etc/audiolad}"

if [[ ! -L "$CURRENT_LINK" ]]; then
  printf '%s\n' '{"error":"current_release_missing"}' >&2
  exit 1
fi

CURRENT_DIR="$(readlink -f "$CURRENT_LINK")"
SRC="${CURRENT_DIR}/deploy"

install -d -m 0755 "$LIB_DIR"
install -d -m 0750 "$ETC_AUDIOLAD"

install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-orchestrator.sh" "${LIB_DIR}/"
install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-ctl.sh" "${LIB_DIR}/"
install -m 0755 "${SRC}/scripts/audiolad-music-storage-bulk-ops-remote.sh" "${LIB_DIR}/"

for unit in audiolad-music-storage-bulk-copy \
  audiolad-music-storage-bulk-cutover \
  audiolad-music-storage-bulk-release-local; do
  install -m 0644 "${SRC}/systemd/${unit}.service" "${SYSTEMD_DIR}/${unit}.service"
  install -m 0644 "${SRC}/systemd/${unit}.timer" "${SYSTEMD_DIR}/${unit}.timer"
done

for example in music-storage-bulk-copy.env.example \
  music-storage-bulk-cutover.env.example \
  music-storage-bulk-release-local.env.example; do
  target="${ETC_AUDIOLAD}/${example%.example}"
  if [[ ! -f "$target" ]]; then
    install -m 0600 "${SRC}/etc/audiolad/${example}" "$target"
  fi
done

systemctl daemon-reload

printf '%s\n' "music_storage_bulk_install_ok"
printf '%s\n' "lib_dir=${LIB_DIR}"
printf '%s\n' "next: review ${ETC_AUDIOLAD}/music-storage-bulk-copy.env, then OPS start or ctl start"