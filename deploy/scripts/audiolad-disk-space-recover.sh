#!/usr/bin/env bash
# One-shot production disk-space recover for operators / GHA
# confirm=OPS_DISK_SPACE_RECOVER
# Deletes ONLY these three paths:
#   /var/www/audiolad-deploy/releases/20260924-161850-35872951
#   /tmp/cursor-sandbox-cache
#   /tmp/node-compile-cache
# Do NOT delete /tmp/audiolad-render-stage, /tmp/audiolad-timeline-ruler,
# current/previous, storage assets, Supabase data, user projects,
# PM2 logs, or nginx logs.
# Never invokes audiolad-deploy / deploy.sh, never changes nginx, never
# restarts PM2, never mutates DB or Supabase Storage.
# Operator/local equivalent:
#   bash deploy/scripts/audiolad-disk-space-recover.sh
set -Eeuo pipefail

if [[ "${#}" -ge 2 && "${1:-}" =~ ^[0-9a-f]{40}$ ]]; then
  TARGET_SHA="$1"
  ORIGIN_MAIN_SHA="$2"
  shift 2
fi

ALLOWED_RELEASE_BASENAME="20260924-161850-35872951"
MIN_FREE_MB=3500
CUTOVER="NO"
AUDIOLAD_DEPLOY="NOT_INVOKED"
MODE="disk_space_recover"
RESULT="PENDING"
CURRENT_RELEASE_INTACT="UNKNOWN"
PREVIOUS_RELEASE_INTACT="UNKNOWN"

if [[ "${AUDIOLAD_DISK_SPACE_RECOVER_TEST:-}" == "1" ]]; then
  : "${DEPLOY_ROOT:?DEPLOY_ROOT is required in test mode}"
  : "${CACHE_CURSOR:?CACHE_CURSOR is required in test mode}"
  : "${CACHE_NODE:?CACHE_NODE is required in test mode}"
  PROC_ROOT="${PROC_ROOT:-/proc}"
else
  DEPLOY_ROOT="/var/www/audiolad-deploy"
  CACHE_CURSOR="/tmp/cursor-sandbox-cache"
  CACHE_NODE="/tmp/node-compile-cache"
  PROC_ROOT="/proc"
fi

CURRENT_LINK="${DEPLOY_ROOT}/current"
PREVIOUS_LINK="${DEPLOY_ROOT}/previous"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
CANDIDATE_PATH="${RELEASES_DIR}/${ALLOWED_RELEASE_BASENAME}"

section() {
  printf '\n===== %s =====\n' "$1"
}

bytes_to_mb() {
  local bytes="$1"
  if [[ ! "${bytes}" =~ ^[0-9]+$ ]]; then
    echo "0"
    return
  fi
  echo $((bytes / 1024 / 1024))
}

kb_to_mb() {
  local kb="$1"
  if [[ ! "${kb}" =~ ^[0-9]+$ ]]; then
    echo "0"
    return
  fi
  echo $((kb / 1024))
}

read_df_avail_kb() {
  local override="${1:-}"
  if [[ -n "${override}" ]]; then
    printf '%s\n' "${override}"
    return
  fi
  df -Pk / | awk 'NR==2 {print $4}'
}

path_size_bytes() {
  local path="$1"
  if [[ ! -e "${path}" ]]; then
    echo "0"
    return
  fi
  du -sb -- "${path}" 2>/dev/null | awk '{print $1}'
}

print_path_meta() {
  local path="$1"
  if [[ ! -e "${path}" && ! -L "${path}" ]]; then
    echo "meta path=${path} missing=YES"
    return
  fi
  stat -c 'owner=%U mtime=%y size=%s' -- "${path}" 2>/dev/null \
    | awk -v p="${path}" '{print "meta path=" p " " $0}'
}

is_under_tmp() {
  local path="$1"
  case "${path}" in
    /tmp/*) return 0 ;;
    *) return 1 ;;
  esac
}

cache_has_live_refs() {
  local path="$1"
  local piddir="" kind="" fd="" target=""
  local prefix="${path%/}"

  shopt -s nullglob
  for piddir in "${PROC_ROOT}"/[0-9]*; do
    for kind in cwd root exe; do
      if [[ -L "${piddir}/${kind}" ]]; then
        target="$(readlink -- "${piddir}/${kind}" 2>/dev/null || :)"
        if [[ "${target}" == "${prefix}" || "${target}" == "${prefix}/"* ]]; then
          echo "pid=$(basename "${piddir}") ref=${kind} target=${target}"
          shopt -u nullglob
          return 0
        fi
      fi
    done
    if [[ -d "${piddir}/fd" ]]; then
      for fd in "${piddir}/fd"/*; do
        if [[ -L "${fd}" ]]; then
          target="$(readlink -- "${fd}" 2>/dev/null || :)"
          if [[ "${target}" == "${prefix}" || "${target}" == "${prefix}/"* ]]; then
            echo "pid=$(basename "${piddir}") ref=fd/$(basename "${fd}") target=${target}"
            shopt -u nullglob
            return 0
          fi
        fi
      done
    fi
  done
  shopt -u nullglob
  return 1
}

resolve_link_real() {
  local link="$1"
  if [[ ! -L "${link}" ]]; then
    return 1
  fi
  readlink -f -- "${link}"
}

validate_release_candidate() {
  local current_real="$1"
  local previous_real="$2"
  local base parent_real candidate_real

  base="$(basename -- "${CANDIDATE_PATH}")"
  if [[ "${base}" != "${ALLOWED_RELEASE_BASENAME}" ]]; then
    echo "basename_mismatch"
    return 1
  fi
  if [[ ! -d "${RELEASES_DIR}" ]]; then
    echo "releases_dir_missing"
    return 1
  fi
  parent_real="$(readlink -f -- "${RELEASES_DIR}")"
  case "${parent_real}" in
    */releases) ;;
    *)
      echo "releases_dir_invalid"
      return 1
      ;;
  esac
  if [[ -L "${CANDIDATE_PATH}" ]]; then
    echo "candidate_is_symlink"
    return 1
  fi
  if [[ ! -d "${CANDIDATE_PATH}" ]]; then
    echo "candidate_not_directory"
    return 1
  fi
  candidate_real="$(readlink -f -- "${CANDIDATE_PATH}")"
  if [[ "${candidate_real}" != "${parent_real}/${ALLOWED_RELEASE_BASENAME}" ]]; then
    echo "not_under_releases"
    return 1
  fi
  if [[ "${candidate_real}" == "${current_real}" ]]; then
    echo "equals_current"
    return 1
  fi
  if [[ "${candidate_real}" == "${previous_real}" ]]; then
    echo "equals_previous"
    return 1
  fi
  echo "ok"
  return 0
}

validate_cache_path() {
  local path="$1"
  if [[ "${AUDIOLAD_DISK_SPACE_RECOVER_TEST:-}" == "1" ]]; then
    if [[ "${path}" != "${CACHE_CURSOR}" && "${path}" != "${CACHE_NODE}" ]]; then
      echo "not_allowlisted_cache"
      return 1
    fi
  else
    if [[ "${path}" != "/tmp/cursor-sandbox-cache" && "${path}" != "/tmp/node-compile-cache" ]]; then
      echo "not_allowlisted_cache"
      return 1
    fi
  fi
  if ! is_under_tmp "${path}"; then
    echo "not_under_tmp"
    return 1
  fi
  if [[ -L "${path}" ]]; then
    echo "path_is_symlink"
    return 1
  fi
  if [[ ! -e "${path}" ]]; then
    echo "missing"
    return 2
  fi
  if [[ ! -d "${path}" ]]; then
    echo "not_directory"
    return 1
  fi
  echo "ok"
  return 0
}

print_item() {
  printf 'ITEM path=%s size_before=%s validation=%s action=%s reason=%s\n' \
    "$1" "$2" "$3" "$4" "$5"
}

section "DISK_SPACE_RECOVER"
echo "confirm=OPS_DISK_SPACE_RECOVER"
echo "CUTOVER=${CUTOVER}"
echo "audiolad_deploy=${AUDIOLAD_DEPLOY}"
echo "MODE=${MODE}"
if [[ -n "${TARGET_SHA:-}" ]]; then
  echo "target_sha=${TARGET_SHA}"
fi
if [[ -n "${ORIGIN_MAIN_SHA:-}" ]]; then
  echo "origin_main_sha=${ORIGIN_MAIN_SHA}"
fi

echo
echo "df -h /"
df -h /
echo
echo "df -Pk /"
df -Pk /

FREE_KB_BEFORE="$(read_df_avail_kb "${DF_AVAIL_KB_BEFORE:-}")"
FREE_MB_BEFORE="$(kb_to_mb "${FREE_KB_BEFORE}")"
echo "FREE_MB_BEFORE=${FREE_MB_BEFORE}"

CURRENT_REAL=""
PREVIOUS_REAL=""
if CURRENT_REAL="$(resolve_link_real "${CURRENT_LINK}")"; then
  CURRENT_RELEASE_INTACT="YES"
  echo "CURRENT path=${CURRENT_LINK} real=${CURRENT_REAL}"
else
  CURRENT_RELEASE_INTACT="NO"
  echo "CURRENT_RESOLVE=FAILED path=${CURRENT_LINK}"
fi
if PREVIOUS_REAL="$(resolve_link_real "${PREVIOUS_LINK}")"; then
  PREVIOUS_RELEASE_INTACT="YES"
  echo "PREVIOUS path=${PREVIOUS_LINK} real=${PREVIOUS_REAL}"
else
  PREVIOUS_RELEASE_INTACT="NO"
  echo "PREVIOUS_RESOLVE=FAILED path=${PREVIOUS_LINK}"
fi

RELEASE_SIZE="$(path_size_bytes "${CANDIDATE_PATH}")"
print_path_meta "${CANDIDATE_PATH}"
if [[ "${CURRENT_RELEASE_INTACT}" != "YES" || "${PREVIOUS_RELEASE_INTACT}" != "YES" ]]; then
  print_item "${CANDIDATE_PATH}" "${RELEASE_SIZE}" "REFUSED" "SKIPPED" "current_or_previous_unresolved"
elif ! RELEASE_REASON="$(validate_release_candidate "${CURRENT_REAL}" "${PREVIOUS_REAL}")"; then
  print_item "${CANDIDATE_PATH}" "${RELEASE_SIZE}" "REFUSED" "SKIPPED" "${RELEASE_REASON}"
else
  if rm -rf -- "${CANDIDATE_PATH}"; then
    if [[ -e "${CANDIDATE_PATH}" || -L "${CANDIDATE_PATH}" ]]; then
      print_item "${CANDIDATE_PATH}" "${RELEASE_SIZE}" "OK" "SKIPPED" "rm_left_path"
    else
      print_item "${CANDIDATE_PATH}" "${RELEASE_SIZE}" "OK" "DELETED" "allowlisted_old_release"
    fi
  else
    print_item "${CANDIDATE_PATH}" "${RELEASE_SIZE}" "OK" "SKIPPED" "rm_failed"
  fi
fi

if [[ -n "${CURRENT_REAL}" && -d "${CURRENT_REAL}" ]]; then
  CURRENT_RELEASE_INTACT="YES"
else
  CURRENT_RELEASE_INTACT="NO"
fi
if [[ -n "${PREVIOUS_REAL}" && -d "${PREVIOUS_REAL}" ]]; then
  PREVIOUS_RELEASE_INTACT="YES"
else
  PREVIOUS_RELEASE_INTACT="NO"
fi

for cache_path in "${CACHE_CURSOR}" "${CACHE_NODE}"; do
  cache_size="$(path_size_bytes "${cache_path}")"
  print_path_meta "${cache_path}"
  cache_rc=0
  cache_reason="$(validate_cache_path "${cache_path}")" || cache_rc=$?
  if [[ "${cache_rc}" -eq 2 ]]; then
    print_item "${cache_path}" "${cache_size}" "SKIPPED" "SKIPPED" "missing"
    continue
  fi
  if [[ "${cache_rc}" -ne 0 ]]; then
    print_item "${cache_path}" "${cache_size}" "REFUSED" "SKIPPED" "${cache_reason}"
    continue
  fi
  live_ref=""
  if live_ref="$(cache_has_live_refs "${cache_path}")"; then
    print_item "${cache_path}" "${cache_size}" "OK" "SKIPPED" "live_process_ref ${live_ref}"
    continue
  fi
  if rm -rf -- "${cache_path}"; then
    if [[ -e "${cache_path}" || -L "${cache_path}" ]]; then
      print_item "${cache_path}" "${cache_size}" "OK" "SKIPPED" "rm_left_path"
    else
      print_item "${cache_path}" "${cache_size}" "OK" "DELETED" "reproducible_cache"
    fi
  else
    print_item "${cache_path}" "${cache_size}" "OK" "SKIPPED" "rm_failed"
  fi
done

echo
echo "df -h /"
df -h /
echo
echo "df -Pk /"
df -Pk /

FREE_KB_AFTER="$(read_df_avail_kb "${DF_AVAIL_KB_AFTER:-}")"
FREE_MB_AFTER="$(kb_to_mb "${FREE_KB_AFTER}")"
if [[ "${FREE_KB_AFTER}" =~ ^[0-9]+$ && "${FREE_KB_BEFORE}" =~ ^[0-9]+$ && "${FREE_KB_AFTER}" -ge "${FREE_KB_BEFORE}" ]]; then
  FREED_MB="$(kb_to_mb $((FREE_KB_AFTER - FREE_KB_BEFORE)))"
else
  FREED_MB="0"
fi
echo "FREE_MB_BEFORE=${FREE_MB_BEFORE}"
echo "FREE_MB_AFTER=${FREE_MB_AFTER}"
echo "FREED_MB=${FREED_MB}"

if [[ "${FREE_MB_AFTER}" =~ ^[0-9]+$ && "${FREE_MB_AFTER}" -ge "${MIN_FREE_MB}" ]]; then
  RESULT="OK"
else
  RESULT="NEEDS_MORE_SPACE"
fi

echo "CURRENT_RELEASE_INTACT=${CURRENT_RELEASE_INTACT}"
echo "PREVIOUS_RELEASE_INTACT=${PREVIOUS_RELEASE_INTACT}"
echo "CUTOVER=${CUTOVER}"
echo "audiolad_deploy=${AUDIOLAD_DEPLOY}"
echo "RESULT=${RESULT}"
section "DISK_SPACE_RECOVER_END"

exit 0
