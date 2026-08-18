#!/usr/bin/env bash
set -Eeuo pipefail

# Reusable Timeweb release for SEO articles and listen pages.
# Usage: release-article.sh <commit-sha> <production-url>
# Stages: ancestry → immutable deploy/skip → health → page smoke → sitemap → report
# Does not edit application code, DB, Nginx, env, or playlists.

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  printf '%s\n' "Usage: release-article.sh <commit-sha> <production-url>"
  exit 2
fi

SHA="$1"
URL="$2"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/run/audiolad-deploy.lock}"
HEALTH_URL="${HEALTH_URL:-https://audiolad.ru/api/health/build}"
SITEMAP_URL="${SITEMAP_URL:-https://audiolad.ru/sitemap.xml}"

STAGE="init"
ANCESTRY_ORIGIN_MAIN="NOT_AVAILABLE"
DEPLOY_ACTION="NOT_AVAILABLE"
DEPLOYED_SHA="NOT_AVAILABLE"
RELEASE_ID="NOT_AVAILABLE"
BUILD_ID="NOT_AVAILABLE"
ROLLBACK_TARGET="NOT_AVAILABLE"
HEALTH="NOT_AVAILABLE"
HTTP_STATUS="NOT_AVAILABLE"
H1="NOT_AVAILABLE"
METADATA="NOT_AVAILABLE"
CANONICAL="NOT_AVAILABLE"
ROBOTS="NOT_AVAILABLE"
SSR="NOT_AVAILABLE"
PLAYLIST="NOT_AVAILABLE"
PLAYLIST_SLUG="NOT_AVAILABLE"
LISTEN_ALL="NOT_AVAILABLE"
FAQ="NOT_AVAILABLE"
JSONLD="NOT_AVAILABLE"
BREADCRUMB="NOT_AVAILABLE"
INTERNAL_LINKS="NOT_AVAILABLE"
SITEMAP="NOT_AVAILABLE"
SITEMAP_URL_COUNT="NOT_AVAILABLE"
PLAYBACK="NOT_AVAILABLE"
DESKTOP_MOBILE="NOT_AVAILABLE"
PLAYBACK_REASON="Listen/article Playwright Play All smoke is not part of this utility. scripts/playlists-play-all-production-smoke.sh creates disposable users and writes the DB."
DESKTOP_MOBILE_REASON="No side-effect-free desktop/mobile browser smoke is invoked by this utility."

fail() {
  local code=$?
  printf '\nBLOCKED stage=%s sha=%s url=%s exit=%s\n' "${STAGE}" "${SHA}" "${URL}" "${code}"
  printf 'DEPLOYED_SHA=%s RELEASE_ID=%s BUILD_ID=%s\n' "${DEPLOYED_SHA}" "${RELEASE_ID}" "${BUILD_ID}"
  exit "${code}"
}
trap fail ERR

run() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

resolve_git_and_deploy() {
  if [[ -n "${GIT_WORKDIR:-}" ]]; then
    :
  elif [[ -d /var/www/audiolad-clean/.git ]]; then
    GIT_WORKDIR="/var/www/audiolad-clean"
  elif [[ -d /var/www/audiolad/.git ]]; then
    GIT_WORKDIR="/var/www/audiolad"
  else
    printf '%s\n' "BLOCKED: GIT_WORKDIR not found"
    exit 1
  fi
  if [[ -x "${GIT_WORKDIR}/deploy/scripts/deploy.sh" ]]; then
    DEPLOY_SH="${GIT_WORKDIR}/deploy/scripts/deploy.sh"
  elif [[ -x /var/www/audiolad-deploy/scripts/deploy.sh ]]; then
    DEPLOY_SH="/var/www/audiolad-deploy/scripts/deploy.sh"
  else
    printf '%s\n' "BLOCKED: staff deploy.sh not found"
    exit 1
  fi
  export GIT_WORKDIR
}

resolve_lib() {
  local candidates=(
    "${SCRIPT_DIR}/../../scripts/release-article-lib.mjs"
    "${GIT_WORKDIR}/scripts/release-article-lib.mjs"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}" ]]; then
      LIB_JS="${candidate}"
      return 0
    fi
  done
  git -C "${GIT_WORKDIR}" show origin/main:scripts/release-article-lib.mjs > /tmp/release-article-lib.mjs
  LIB_JS="/tmp/release-article-lib.mjs"
}

read_current_commit() {
  if [[ -L "${DEPLOY_ROOT}/current" ]]; then
    local current_dir
    current_dir="$(readlink -f "${DEPLOY_ROOT}/current")"
    if [[ -n "${current_dir}" && -f "${current_dir}/.deploy-commit" ]]; then
      tr -d '\n' < "${current_dir}/.deploy-commit"
    fi
  fi
}

refresh_release_metadata() {
  DEPLOYED_SHA="$(read_current_commit || true)"
  if [[ -L "${DEPLOY_ROOT}/current" ]]; then
    RELEASE_ID="$(basename "$(readlink -f "${DEPLOY_ROOT}/current")")"
    if [[ -f "${DEPLOY_ROOT}/current/.next/BUILD_ID" ]]; then
      BUILD_ID="$(tr -d '\n' < "${DEPLOY_ROOT}/current/.next/BUILD_ID")"
    fi
  fi
  if [[ -L "${DEPLOY_ROOT}/previous" ]]; then
    if [[ -f "${DEPLOY_ROOT}/previous/.deploy-commit" ]]; then
      ROLLBACK_TARGET="$(tr -d '\n' < "${DEPLOY_ROOT}/previous/.deploy-commit")"
    else
      ROLLBACK_TARGET="$(basename "$(readlink -f "${DEPLOY_ROOT}/previous")")"
    fi
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STAGE="resolve_paths"
resolve_git_and_deploy
resolve_lib

STAGE="canonical_preflight"
git -C "${GIT_WORKDIR}" fetch origin main
git -C "${GIT_WORKDIR}" cat-file -e "${SHA}^{commit}"
if git -C "${GIT_WORKDIR}" merge-base --is-ancestor "${SHA}" origin/main; then
  ANCESTRY_ORIGIN_MAIN="OK"
else
  ANCESTRY_ORIGIN_MAIN="FAILED"
  printf '%s\n' "BLOCKED: ${SHA} is not in origin/main ancestry"
  exit 1
fi

STAGE="expect"
EXPECT_FILE="$(mktemp)"
node "${LIB_JS}" expect --git-workdir "${GIT_WORKDIR}" --sha "${SHA}" --url "${URL}" > "${EXPECT_FILE}"

STAGE="read_release_metadata"
refresh_release_metadata

STAGE="deploy_lock_or_skip"
if [[ -n "${DEPLOYED_SHA}" && "${DEPLOYED_SHA}" == "${SHA}" ]]; then
  DEPLOY_ACTION="SKIPPED_ALREADY_DEPLOYED"
else
  if [[ -e "${DEPLOY_LOCK_FILE}" ]] && command -v flock >/dev/null 2>&1; then
    if ! flock -n "${DEPLOY_LOCK_FILE}" true; then
      printf '%s\n' "BLOCKED: foreign deploy lock ${DEPLOY_LOCK_FILE}"
      exit 1
    fi
  fi
  STAGE="immutable_deploy"
  run env GIT_WORKDIR="${GIT_WORKDIR}" "${DEPLOY_SH}" "${SHA}"
  DEPLOY_ACTION="DEPLOYED"
  refresh_release_metadata
fi

if [[ -z "${DEPLOYED_SHA}" || "${DEPLOYED_SHA}" != "${SHA}" ]]; then
  printf '%s\n' "BLOCKED: current/.deploy-commit=${DEPLOYED_SHA:-empty} != ${SHA}"
  exit 1
fi

STAGE="health"
HEALTH_JSON="$(curl -fsS --max-time 30 "${HEALTH_URL}")"
HEALTH_STATUS="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("status",""))' <<<"${HEALTH_JSON}")"
HEALTH_BUILD="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("buildId") or "")' <<<"${HEALTH_JSON}")"
HEALTH_CWD="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("cwd") or "")' <<<"${HEALTH_JSON}")"
if [[ -n "${HEALTH_BUILD}" ]]; then
  BUILD_ID="${HEALTH_BUILD}"
fi
if [[ "${HEALTH_STATUS}" == "ok" ]]; then
  HEALTH="OK"
else
  HEALTH="FAILED"
  printf '%s\n' "BLOCKED: /api/health/build status=${HEALTH_STATUS}"
  exit 1
fi
if [[ -n "${HEALTH_CWD}" && "${RELEASE_ID}" == "NOT_AVAILABLE" ]]; then
  RELEASE_ID="$(basename "${HEALTH_CWD}")"
fi

STAGE="page_http_smoke"
PAGE_FILE="$(mktemp)"
HTTP_STATUS="$(curl -sS -o "${PAGE_FILE}" -w '%{http_code}' --max-time 45 "${URL}")"
if [[ "${HTTP_STATUS}" != "200" ]]; then
  printf '%s\n' "BLOCKED: page HTTP ${HTTP_STATUS}"
  exit 1
fi
PAGE_REPORT="$(node "${LIB_JS}" smoke --html "${PAGE_FILE}" --expect "${EXPECT_FILE}")"
rm -f "${PAGE_FILE}"
eval "$(printf '%s\n' "${PAGE_REPORT}")"

for key in H1 METADATA CANONICAL ROBOTS SSR JSONLD BREADCRUMB; do
  val="${!key}"
  if [[ "${val}" != "OK" ]]; then
    printf '%s\n' "BLOCKED: page smoke ${key}=${val}"
    exit 1
  fi
done
if [[ "${PLAYLIST}" == "FAILED" || "${LISTEN_ALL}" == "FAILED" || "${FAQ}" == "FAILED" || "${INTERNAL_LINKS}" == "FAILED" ]]; then
  printf '%s\n' "BLOCKED: listen/article smoke PLAYLIST=${PLAYLIST} LISTEN_ALL=${LISTEN_ALL} FAQ=${FAQ} INTERNAL_LINKS=${INTERNAL_LINKS}"
  exit 1
fi

STAGE="sitemap"
SITEMAP_FILE="$(mktemp)"
SITEMAP_HTTP="$(curl -sS -o "${SITEMAP_FILE}" -w '%{http_code}' --max-time 45 "${SITEMAP_URL}")"
if [[ "${SITEMAP_HTTP}" != "200" ]]; then
  SITEMAP="FAILED"
  SITEMAP_URL_COUNT="0"
  rm -f "${SITEMAP_FILE}" "${EXPECT_FILE}"
  printf '%s\n' "BLOCKED: sitemap HTTP ${SITEMAP_HTTP}"
  exit 1
fi
SITEMAP_URL_COUNT="$(python3 -c 'import sys; html=open(sys.argv[1],encoding="utf-8",errors="replace").read(); print(html.count(sys.argv[2]))' "${SITEMAP_FILE}" "${URL}")"
rm -f "${SITEMAP_FILE}" "${EXPECT_FILE}"
if [[ "${SITEMAP_URL_COUNT}" == "1" ]]; then
  SITEMAP="OK"
else
  SITEMAP="FAILED"
  printf '%s\n' "BLOCKED: sitemap count for URL is ${SITEMAP_URL_COUNT}, expected 1"
  exit 1
fi

STAGE="report"
printf '\n===== TIMEWEB RELEASE REPORT =====\n'
printf 'SHA=%s\n' "${SHA}"
printf 'ANCESTRY_ORIGIN_MAIN=%s\n' "${ANCESTRY_ORIGIN_MAIN}"
printf 'DEPLOY_ACTION=%s\n' "${DEPLOY_ACTION}"
printf 'DEPLOYED_SHA=%s\n' "${DEPLOYED_SHA}"
printf 'RELEASE_ID=%s\n' "${RELEASE_ID}"
printf 'BUILD_ID=%s\n' "${BUILD_ID}"
printf 'ROLLBACK_TARGET=%s\n' "${ROLLBACK_TARGET}"
printf 'HEALTH=%s\n' "${HEALTH}"
printf 'URL=%s\n' "${URL}"
printf 'HTTP_STATUS=%s\n' "${HTTP_STATUS}"
printf 'H1=%s\n' "${H1}"
printf 'METADATA=%s\n' "${METADATA}"
printf 'CANONICAL=%s\n' "${CANONICAL}"
printf 'ROBOTS=%s\n' "${ROBOTS}"
printf 'SSR=%s\n' "${SSR}"
printf 'PLAYLIST=%s\n' "${PLAYLIST}"
printf 'PLAYLIST_SLUG=%s\n' "${PLAYLIST_SLUG}"
printf 'LISTEN_ALL=%s\n' "${LISTEN_ALL}"
printf 'FAQ=%s\n' "${FAQ}"
printf 'JSONLD=%s\n' "${JSONLD}"
printf 'BREADCRUMB=%s\n' "${BREADCRUMB}"
printf 'INTERNAL_LINKS=%s\n' "${INTERNAL_LINKS}"
printf 'PLAYBACK=%s\n' "${PLAYBACK}"
printf 'DESKTOP_MOBILE=%s\n' "${DESKTOP_MOBILE}"
printf 'SITEMAP=%s\n' "${SITEMAP}"
printf 'SITEMAP_URL_COUNT=%s\n' "${SITEMAP_URL_COUNT}"
printf 'PLAYBACK_REASON=%s\n' "${PLAYBACK_REASON}"
printf 'DESKTOP_MOBILE_REASON=%s\n' "${DESKTOP_MOBILE_REASON}"
printf '==================================\n'
