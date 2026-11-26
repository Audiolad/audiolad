#!/usr/bin/env bash
# Root-only: ensure copy orchestrator env (sets AUDIOLAD_MUSIC_STORAGE_BULK=1).
# Does not enable systemd timer or change cutover / release-local flags.
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
ETC_AUDIOLAD="${AUDIOLAD_ETC_DIR:-/etc/audiolad}"
ENV_FILE="${ETC_AUDIOLAD}/music-storage-bulk-copy.env"
CURRENT="$(readlink -f "${DEPLOY_ROOT}/current")"
EXAMPLE="${CURRENT}/deploy/etc/audiolad/music-storage-bulk-copy.env.example"

install -d -m 0750 "$ETC_AUDIOLAD"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$EXAMPLE" ]]; then
    install -m 0600 "$EXAMPLE" "$ENV_FILE"
  else
    cat >"$ENV_FILE" <<'EOF'
AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_STATE=/var/www/audiolad-deploy/shared/music-storage-bulk-orchestrator.json
AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_BATCH_SIZE=25
AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_CONCURRENCY=1
EOF
    chmod 0600 "$ENV_FILE"
  fi
fi

if ! grep -q '^AUDIOLAD_MUSIC_STORAGE_BULK=1' "$ENV_FILE"; then
  if grep -q '^AUDIOLAD_MUSIC_STORAGE_BULK=' "$ENV_FILE"; then
    sed -i 's/^AUDIOLAD_MUSIC_STORAGE_BULK=.*/AUDIOLAD_MUSIC_STORAGE_BULK=1/' "$ENV_FILE"
  else
    printf '\n%s\n' 'AUDIOLAD_MUSIC_STORAGE_BULK=1' >>"$ENV_FILE"
  fi
fi

chmod 0600 "$ENV_FILE"
printf '%s\n' "music_storage_bulk_copy_env_enabled"
printf '%s\n' "bulk_flag=1"
printf '%s\n' "env_file=${ENV_FILE}"