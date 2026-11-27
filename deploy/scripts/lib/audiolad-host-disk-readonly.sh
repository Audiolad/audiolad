# shellcheck shell=bash
# Read-only host disk report (root). Sourced by maintenance and disk audit helpers.

audiolad_host_disk_section() {
  printf '\n===%s===\n' "$1"
}

audiolad_host_disk_human_bytes() {
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

audiolad_host_disk_readonly_report() {
  local deploy_root="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
  local db_container="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
  local docker_dir="${AUDIT_DOCKER_VOLUMES_DIR:-/var/lib/docker}"

  set +o pipefail
  audiolad_host_disk_section "HOST_DISK_READONLY"
  echo "OPS_MAINTENANCE_DISK_SNAPSHOT=1"

  audiolad_host_disk_section "PRIV_FILESYSTEM_ROOTS"
  local p
  for p in /var /usr /home /root /opt /tmp; do
    if [[ -e "$p" ]]; then
      printf '%s\n' "top_path=${p} total=$(du -sh "$p" 2>/dev/null | awk '{print $1}' || echo blocked)"
      du -xh --max-depth=1 "$p" 2>/dev/null | sort -hr | head -n 30 || true
    fi
  done

  audiolad_host_disk_section "PRIV_DEPLOY_RELEASES"
  if [[ -d "${deploy_root}/releases" ]]; then
    du -sh "${deploy_root}/releases" 2>/dev/null | sed 's/^/releases_total=/' || true
    find "${deploy_root}/releases" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) -print0 2>/dev/null |
      sort -z |
      xargs -0 -r du -sh 2>/dev/null | sort -hr | sed 's/^/release_size=/' || true
  fi

  audiolad_host_disk_section "PRIV_DOCKER"
  if command -v docker >/dev/null 2>&1; then
    echo "docker_system_df<<"
    docker system df -v 2>&1 | head -n 120 || true
    echo ">>docker_system_df"
    echo "docker_volume_ls<<"
    docker volume ls 2>&1 | head -n 80 || true
    echo ">>docker_volume_ls"
  fi
  if [[ -d "${docker_dir}" ]]; then
    du -sh "${docker_dir}" 2>/dev/null | sed 's/^/docker_dir_total=/' || true
    du -xh --max-depth=1 "${docker_dir}" 2>/dev/null | sort -hr | head -n 25 | sed 's/^/docker_subdir=/' || true
  fi

  audiolad_host_disk_section "PRIV_SUPABASE_STORAGE_BYTES"
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${db_container}"; then
    docker exec "${db_container}" psql -U postgres -d postgres -tA -F $'\t' -c \
      "SELECT bucket_id, count(*)::text, coalesce(sum((nullif(metadata->>'size',''))::bigint),0)::text
         FROM storage.objects
        GROUP BY bucket_id
        ORDER BY coalesce(sum((nullif(metadata->>'size',''))::bigint),0) DESC
        LIMIT 40;" 2>/dev/null | while IFS=$'\t' read -r bucket cnt bytes; do
      [[ -n "$bucket" ]] || continue
      printf 'storage_bucket=%s objects=%s bytes=%s human=%s\n' \
        "$bucket" "$cnt" "$bytes" "$(audiolad_host_disk_human_bytes "${bytes:-0}")"
    done || echo "storage_summary_query_failed"
  else
    echo "supabase_db_container_unavailable"
  fi

  audiolad_host_disk_section "PRIV_DELETED_OPEN_FILES"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP 2>/dev/null | awk '/deleted/ {print}' | head -n 40 || true
  else
    echo "lsof_missing"
  fi

  printf '%s\n' "OPS_MAINTENANCE_DISK_SNAPSHOT_END=ok"
  set -o pipefail
}