#!/usr/bin/env bash
# Deploy-user fallback: extract trusted bundle to $HOME/.cache (never root-owned shared/).
set -Eeuo pipefail

DEST="${HOME:?HOME must be set}/.cache/audiolad/gha-trusted-deploy"
mkdir -p "$DEST"
umask 077
if ! tar -xzf - -C "$DEST"; then
  printf '%s\n' '{"error":"trusted_bundle_tar_failed"}' >&2
  exit 1
fi
if [[ ! -d "$DEST/deploy/sbin" ]]; then
  printf '%s\n' '{"error":"trusted_bundle_layout_invalid"}' >&2
  exit 1
fi
chmod -R u=rwX,go-rwx "$DEST/deploy" 2>/dev/null || true
printf '%s\n' "trusted_bundle_deploy_tree=${DEST}/deploy"
printf '%s\n' "gha_trusted_deploy_bundle_applied=1"
printf '%s\n' "OPS_TRUSTED_BUNDLE_END=ok"