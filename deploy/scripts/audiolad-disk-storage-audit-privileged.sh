#!/usr/bin/env bash
# Root-only read-only fragments for OPS_DISK_STORAGE_AUDIT. No deletes.
set -Eeuo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  printf '%s\n' '{"error":"root_required"}' >&2
  exit 1
fi

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
DB_CONTAINER="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
DOCKER_DIR="${AUDIT_DOCKER_VOLUMES_DIR:-/var/lib/docker}"

section() {
  printf '\n===%s===\n' "$1"
}

human_bytes() {
  local bytes="${1:-0}"
  if ! [[ "${bytes}" =~ ^[0-9]+$ ]]; then
    printf '0\n'
    return 0
  fi
  awk -v b="${bytes}" 'BEGIN {
    if (b < 1024) { printf "%sB\n", b; exit }
    split("K M G T", u)
    n = b
    i = 0
    while (n >= 1024 && i < 4) { n = n / 1024; i++ }
    if (n >= 10) printf "%.0f%s\n", n, u[i]
    else printf "%.1f%s\n", n, u[i]
  }'
}

section "PRIV_FILESYSTEM_ROOTS"
for p in /var /usr /home /root /opt /tmp; do
  if [[ -e "$p" ]]; then
    printf '%s\n' "top_path=${p} total=$(du -sh "$p" 2>/dev/null | awk '{print $1}' || echo blocked)"
    du -xh --max-depth=1 "$p" 2>/dev/null | sort -hr | head -n 30 || true
  fi
done

section "PRIV_DEPLOY_RELEASES"
if [[ -d "${DEPLOY_ROOT}/releases" ]]; then
  du -sh "${DEPLOY_ROOT}/releases" 2>/dev/null | sed 's/^/releases_total=/' || true
  find "${DEPLOY_ROOT}/releases" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) -print0 2>/dev/null |
    sort -z |
    xargs -0 -r du -sh 2>/dev/null | sort -hr | sed 's/^/release_size=/' || true
fi

section "PRIV_DOCKER"
if command -v docker >/dev/null 2>&1; then
  echo "docker_system_df<<"
  docker system df -v 2>&1 | head -n 120 || true
  echo ">>docker_system_df"
  echo "docker_volume_ls<<"
  docker volume ls 2>&1 | head -n 80 || true
  echo ">>docker_volume_ls"
  echo "docker_ps<<"
  docker ps -a --size --no-trunc 2>&1 | head -n 40 || true
  echo ">>docker_ps"
fi
if [[ -d "${DOCKER_DIR}" ]]; then
  du -sh "${DOCKER_DIR}" 2>/dev/null | sed 's/^/docker_dir_total=/' || true
  du -xh --max-depth=1 "${DOCKER_DIR}" 2>/dev/null | sort -hr | head -n 25 | sed 's/^/docker_subdir=/' || true
  if [[ -d "${DOCKER_DIR}/containers" ]]; then
    find "${DOCKER_DIR}/containers" -name '*-json.log' -type f -printf '%s %p\n' 2>/dev/null |
      sort -nr | head -n 25 | while read -r sz path; do
        printf 'container_json_log size=%s path=%s\n' "$(human_bytes "${sz}")" "${path##*/}"
      done || true
  fi
fi

section "PRIV_SUPABASE_STORAGE_BYTES"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${DB_CONTAINER}"; then
  docker exec "${DB_CONTAINER}" psql -U postgres -d postgres -tA -F $'\t' -c \
    "SELECT bucket_id, count(*)::text, coalesce(sum((nullif(metadata->>'size',''))::bigint),0)::text
       FROM storage.objects
      GROUP BY bucket_id
      ORDER BY coalesce(sum((nullif(metadata->>'size',''))::bigint),0) DESC
      LIMIT 40;" 2>/dev/null | while IFS=$'\t' read -r bucket cnt bytes; do
    [[ -n "$bucket" ]] || continue
    printf 'storage_bucket=%s objects=%s bytes=%s human=%s\n' \
      "$bucket" "$cnt" "$bytes" "$(human_bytes "${bytes:-0}")"
  done || echo "storage_summary_query_failed"
else
  echo "supabase_db_container_unavailable"
fi

section "PRIV_DELETED_OPEN_FILES"
if command -v lsof >/dev/null 2>&1; then
  lsof -nP 2>/dev/null | awk '/deleted/ {print}' | head -n 40 || true
  deleted_bytes=0
  while read -r sz _; do
    [[ "$sz" =~ ^[0-9]+$ ]] && deleted_bytes=$((deleted_bytes + sz))
  done < <(lsof -nP 2>/dev/null | awk '/deleted/ {print $7}' | grep -E '^[0-9]+$' | head -n 200)
  printf 'deleted_open_files_approx_bytes=%s human=%s\n' "$deleted_bytes" "$(human_bytes "$deleted_bytes")"
else
  echo "lsof_missing"
fi

section "PRIV_CACHE_ARCHIVES"
for p in /var/cache/apt/archives /root/.npm /root/.cache; do
  [[ -e "$p" ]] || continue
  du -sh "$p" 2>/dev/null | sed "s/^/cache_path=${p} /" || true
done

printf '%s\n' "OPS_DISK_STORAGE_AUDIT_PRIV_END=ok"