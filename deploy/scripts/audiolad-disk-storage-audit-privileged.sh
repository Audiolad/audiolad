#!/usr/bin/env bash
# Root-only read-only fragments for OPS_DISK_STORAGE_AUDIT. No deletes.
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/audiolad-host-disk-readonly.sh
source "${SCRIPT_DIR}/lib/audiolad-host-disk-readonly.sh"
audiolad_host_disk_readonly_report
printf '%s\n' "OPS_DISK_STORAGE_AUDIT_PRIV_END=ok"