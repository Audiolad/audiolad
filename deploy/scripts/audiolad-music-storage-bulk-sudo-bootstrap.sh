#!/usr/bin/env bash
# Install /usr/local/sbin wrappers + sudoers for music-storage bulk GHA ops.
# Root only. Safe to re-run (idempotent file install + visudo).
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
DEPLOY_TREE="${DEPLOY_TREE:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

if [[ -z "$DEPLOY_TREE" ]]; then
  CURRENT="$(readlink -f "${DEPLOY_ROOT}/current")"
  DEPLOY_TREE="${CURRENT}/deploy"
fi

SBIN_SRC="${DEPLOY_TREE}/sbin"
SUDOERS_SRC="${DEPLOY_TREE}/sudoers/audiolad-music-storage-bulk"
SUDOERS_DST="/etc/sudoers.d/audiolad-music-storage-bulk"

if [[ ! -d "$SBIN_SRC" ]]; then
  printf '%s\n' '{"error":"sbin_source_missing"}' >&2
  exit 1
fi
if [[ ! -f "$SUDOERS_SRC" ]]; then
  printf '%s\n' '{"error":"sudoers_source_missing"}' >&2
  exit 1
fi

for name in \
  audiolad-music-storage-bulk-sudo-bootstrap \
  audiolad-music-storage-bulk-install \
  audiolad-music-storage-bulk-ops-status \
  audiolad-music-storage-bulk-ops-start-copy \
  audiolad-music-storage-bulk-ops-pause \
  audiolad-music-storage-bulk-ops-stop \
  audiolad-music-storage-bulk-ops-resume; do
  src="${SBIN_SRC}/${name}"
  if [[ ! -f "$src" ]]; then
    printf '%s\n' "{\"error\":\"sbin_missing\",\"name\":\"${name}\"}" >&2
    exit 1
  fi
  install -o root -g root -m 0755 "$src" "/usr/local/sbin/${name}"
done

install -o root -g root -m 0440 "$SUDOERS_SRC" "$SUDOERS_DST"
visudo -cf "$SUDOERS_DST"

printf '%s\n' "music_storage_bulk_sudo_bootstrap_ok"