#!/usr/bin/env bash
# Ops helper for GHA confirm=OPS_MAINTENANCE_DRY_RUN / OPS_MAINTENANCE_APPLY.
# Sole remote implementation. Fetched from trusted origin/main, never from
# the production current-release tree or a PR branch.
#
# Never invokes audiolad-deploy / deploy.sh. Never does nginx or
# current/previous symlink cutover. Never restarts PM2/nginx/Docker.
# Never passes caller arguments to maintenance. Privilege path is only:
#   sudo -n /usr/local/sbin/audiolad-maintenance-dry-run
#   sudo -n /usr/local/sbin/audiolad-maintenance-apply
# Those wrappers are Draft and are not installed by this helper.
set -Eeuo pipefail

TARGET_SHA="${1:-}"
ORIGIN_MAIN_SHA="${2:-}"
EXPECTED_MAINT_BLOB="${3:-}"
EXPECTED_RETENTION_BLOB="${4:-}"
OPS_MODE="${5:-}"

CUTOVER="NO"
AUDIOLAD_DEPLOY="NOT_INVOKED"
PRIVILEGED_MAINTENANCE="NEED_INSTALL"
CANONICAL_VERSION="UNKNOWN"

section() {
  printf '\n===== %s =====\n' "$1"
}

fail_closed() {
  printf 'ERROR: %s\n' "$1" >&2
  echo "CUTOVER=${CUTOVER}"
  echo "audiolad_deploy=${AUDIOLAD_DEPLOY}"
  echo "PRIVILEGED_MAINTENANCE=${PRIVILEGED_MAINTENANCE}"
  echo "CANONICAL_VERSION=${CANONICAL_VERSION}"
  exit 1
}

git_blob_sha() {
  local path="$1"
  python3 -c '
import hashlib, sys
path = sys.argv[1]
data = open(path, "rb").read()
sys.stdout.write(hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest())
' "$path"
}

if [[ ! "${TARGET_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  fail_closed "TARGET_SHA must be a 40-character lowercase hex SHA"
fi
if [[ ! "${ORIGIN_MAIN_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  fail_closed "ORIGIN_MAIN_SHA must be a 40-character lowercase hex SHA"
fi
if [[ ! "${EXPECTED_MAINT_BLOB}" =~ ^[0-9a-f]{40}$ ]]; then
  fail_closed "EXPECTED_MAINT_BLOB must be a 40-character lowercase hex SHA"
fi
if [[ ! "${EXPECTED_RETENTION_BLOB}" =~ ^[0-9a-f]{40}$ ]]; then
  fail_closed "EXPECTED_RETENTION_BLOB must be a 40-character lowercase hex SHA"
fi
if [[ "${OPS_MODE}" != "dry-run" && "${OPS_MODE}" != "apply" ]]; then
  fail_closed "OPS_MODE must be hardcoded dry-run or apply"
fi

if [[ "${OPS_MODE}" == "dry-run" ]]; then
  WRAPPER="/usr/local/sbin/audiolad-maintenance-dry-run"
  CONFIRM_NAME="OPS_MAINTENANCE_DRY_RUN"
else
  WRAPPER="/usr/local/sbin/audiolad-maintenance-apply"
  CONFIRM_NAME="OPS_MAINTENANCE_APPLY"
fi

INSTALLED_MAINT="/usr/local/lib/audiolad/audiolad-maintenance.sh"
INSTALLED_RETENTION="/usr/local/lib/audiolad/release-retention.sh"

section "MAINTENANCE_OPS"
echo "confirm=${CONFIRM_NAME}"
echo "mode=${OPS_MODE}"
echo "CUTOVER=${CUTOVER}"
echo "audiolad_deploy=${AUDIOLAD_DEPLOY}"
echo "target_sha=${TARGET_SHA}"
echo "origin_main_sha=${ORIGIN_MAIN_SHA}"
echo "wrapper=${WRAPPER}"
echo "KEEP_EXTRA_RELEASES=1 (canonical installed policy; not overridden)"

section "DISK_BEFORE"
df -h /
df -Pk /

section "CANONICAL_VERSION"
if [[ ! -f "${INSTALLED_MAINT}" || ! -f "${INSTALLED_RETENTION}" ]]; then
  CANONICAL_VERSION="MISSING"
  fail_closed "installed maintenance files missing under /usr/local/lib/audiolad"
fi
ACTUAL_MAINT_BLOB="$(git_blob_sha "${INSTALLED_MAINT}")"
ACTUAL_RETENTION_BLOB="$(git_blob_sha "${INSTALLED_RETENTION}")"
echo "expected_maintenance_blob=${EXPECTED_MAINT_BLOB}"
echo "actual_maintenance_blob=${ACTUAL_MAINT_BLOB}"
echo "expected_retention_blob=${EXPECTED_RETENTION_BLOB}"
echo "actual_retention_blob=${ACTUAL_RETENTION_BLOB}"
if [[ "${ACTUAL_MAINT_BLOB}" != "${EXPECTED_MAINT_BLOB}" ||
      "${ACTUAL_RETENTION_BLOB}" != "${EXPECTED_RETENTION_BLOB}" ]]; then
  CANONICAL_VERSION="MISMATCH"
  fail_closed "installed maintenance scripts do not match trusted origin/main blobs"
fi
CANONICAL_VERSION="OK"
echo "CANONICAL_VERSION=${CANONICAL_VERSION}"

section "PRIVILEGE_PATH"
if [[ ! -e "${WRAPPER}" ]]; then
  PRIVILEGED_MAINTENANCE="NEED_INSTALL"
  echo "PRIVILEGED_MAINTENANCE=${PRIVILEGED_MAINTENANCE}"
  echo "BLOCKER=no narrow production privilege path for ${WRAPPER}"
  echo "existing /usr/local/sbin/audiolad-maintenance.sh passes \"\$@\" and has no deploy sudoers"
  echo "do not install wrappers/sudoers from this job"
  fail_closed "OPS ${CONFIRM_NAME} requires a later explicit bootstrap of the no-arg wrapper + sudoers"
fi

OWNER_MODE="$(stat -c '%U:%G %a' "${WRAPPER}" 2>/dev/null || true)"
echo "wrapper_owner_mode=${OWNER_MODE}"
if [[ "${OWNER_MODE}" != "root:root 755" ]]; then
  PRIVILEGED_MAINTENANCE="NEED_INSTALL"
  fail_closed "wrapper must be root:root 755"
fi

section "MAINTENANCE_RUN"
echo "INVOKING=sudo -n ${WRAPPER}"
sudo -n -- "${WRAPPER}"
PRIVILEGED_MAINTENANCE="OK"
echo "PRIVILEGED_MAINTENANCE=${PRIVILEGED_MAINTENANCE}"

section "DISK_AFTER"
df -h /
df -Pk /

section "MAINTENANCE_OPS_END"
echo "CUTOVER=${CUTOVER}"
echo "audiolad_deploy=${AUDIOLAD_DEPLOY}"
echo "PRIVILEGED_MAINTENANCE=${PRIVILEGED_MAINTENANCE}"
echo "CANONICAL_VERSION=${CANONICAL_VERSION}"
echo "MODE=${OPS_MODE}"
