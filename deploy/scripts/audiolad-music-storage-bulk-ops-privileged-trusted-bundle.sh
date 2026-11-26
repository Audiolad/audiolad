#!/usr/bin/env bash
# Root-only: receive trusted deploy/ tarball on stdin (no args).
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

DEST="/var/lib/audiolad/gha-trusted-deploy"
install -d -m 0750 -o root -g root "$DEST"
umask 077
if ! tar -xzf - -C "$DEST"; then
  printf '%s\n' '{"error":"trusted_bundle_tar_failed"}' >&2
  exit 1
fi
if [[ ! -d "$DEST/deploy/sbin" || ! -f "$DEST/deploy/sudoers/audiolad-music-storage-bulk" ]]; then
  printf '%s\n' '{"error":"trusted_bundle_layout_invalid"}' >&2
  exit 1
fi
chmod -R go-rwx "$DEST/deploy" 2>/dev/null || true
printf '%s\n' "trusted_bundle_deploy_tree=${DEST}/deploy"
printf '%s\n' "OPS_TRUSTED_BUNDLE_END=ok"