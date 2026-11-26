#!/usr/bin/env bash
# Apply trusted deploy/ bundle tarball to shared staging (deploy user). GHA pipes tar on stdin.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
DEST="${DEPLOY_ROOT}/shared/.gha-trusted-deploy"

mkdir -p "$DEST"
umask 077
tar -xzf - -C "$DEST"
printf '%s\n' "gha_trusted_deploy_bundle_applied=1"
printf '%s\n' "deploy_tree=${DEST}/deploy"