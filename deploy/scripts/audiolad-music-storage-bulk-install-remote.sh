#!/usr/bin/env bash
# Deploy-user entry: bootstrap privileged assets, then root install.
# GHA fetches this script from origin/main (trusted helper).
set -Eeuo pipefail

bootstrap_privileged_assets() {
  if sudo -n /usr/local/sbin/audiolad-music-storage-bulk-sudo-bootstrap 2>/dev/null; then
    return 0
  fi
  local current
  current="$(readlink -f /var/www/audiolad-deploy/current)"
  local boot="${current}/deploy/scripts/audiolad-music-storage-bulk-sudo-bootstrap.sh"
  if [[ -f "$boot" ]]; then
    sudo -n "$boot"
    return $?
  fi
  return 1
}

if [[ "$(id -u)" -eq 0 ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  exec "${SCRIPT_DIR}/audiolad-music-storage-bulk-root-install.sh"
fi

if ! bootstrap_privileged_assets; then
  printf '%s\n' '{"error":"music_storage_bulk_sudo_bootstrap_failed","hint":"install deploy/sudoers/audiolad-music-storage-bulk or run production DEPLOY once"}' >&2
  exit 1
fi

exec sudo -n /usr/local/sbin/audiolad-music-storage-bulk-install