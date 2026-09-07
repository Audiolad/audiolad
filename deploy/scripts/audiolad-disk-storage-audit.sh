#!/usr/bin/env bash
# Read-only production disk/Storage cleanup AUDIT for operators / GHA
# confirm=OPS_DISK_STORAGE_AUDIT. Never deletes production paths, never
# invokes audiolad-deploy / deploy.sh, never does nginx or current/previous
# symlink cutover, never prints env file contents or secret values.
# Docker exec to supabase-db may fail for deploy — fall back to node
# loadEnvConfig + supabase-js, same as recover. Do not load .env.production
# in this shell.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
PREVIOUS_LINK="${DEPLOY_ROOT}/previous"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
SHARED_ENV_PRODUCTION="${DEPLOY_ROOT}/shared/.env.production"
DB_CONTAINER="${AUDIOLAD_SUPABASE_DB_CONTAINER:-supabase-db}"
AUDIT_TMP_DIR="${AUDIT_TMP_DIR:-/tmp}"
AUDIT_LOG_DIR="${AUDIT_LOG_DIR:-/var/log}"
AUDIT_NGINX_LOG_DIR="${AUDIT_NGINX_LOG_DIR:-/var/log/nginx}"
AUDIT_PM2_LOG_DIR="${AUDIT_PM2_LOG_DIR:-/home/deploy/.pm2/logs}"
AUDIT_DOCKER_VOLUMES_DIR="${AUDIT_DOCKER_VOLUMES_DIR:-/var/lib/docker/volumes}"

CUTOVER="NO"
AUDIOLAD_DEPLOY="NOT_INVOKED"
MODE="read_only_audit"
SAFE_DELETE_BYTES=0
SAFE_DELETE_LINES=()
NEEDS_REVIEW_LINES=()
TEST_ORPHAN_LINES=()
OLD_RELEASE_LINES=()
DISK_BEFORE_TEXT=""
LARGEST_DIRS_TEXT=""
LOG_SIZES_TEXT=""

if ! declare -F redact_stream >/dev/null 2>&1; then
  redact_stream() {
    sed -E \
      -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
      -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
      -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
      -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g'
  }
fi

redact_studio_stream() {
  redact_stream | sed -E \
    -e 's#https?://[^[:space:]\"'\'']+#[redacted-url]#g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted-jwt]/g'
}

if ! declare -F section >/dev/null 2>&1; then
  section() {
    printf '\n===== %s =====\n' "$1"
  }
fi

human_bytes() {
  local bytes="${1:-0}"
  if ! [[ "${bytes}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "0"
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

path_bytes() {
  local path="$1"
  if [[ -z "${path}" || ! -e "${path}" ]]; then
    printf '%s\n' "0"
    return 0
  fi
  du -sb --apparent-size "${path}" 2>/dev/null | awk '{print $1; exit}' || printf '%s\n' "0"
}

add_safe_delete() {
  local bytes="$1"
  local line="$2"
  if ! [[ "${bytes}" =~ ^[0-9]+$ ]]; then
    bytes=0
  fi
  SAFE_DELETE_BYTES=$((SAFE_DELETE_BYTES + bytes))
  SAFE_DELETE_LINES+=("${line}")
}

add_needs_review() {
  NEEDS_REVIEW_LINES+=("$1")
}

add_test_orphan() {
  TEST_ORPHAN_LINES+=("$1")
}

print_list_or_none() {
  local -n lines=$1
  if ((${#lines[@]} == 0)); then
    echo "(none)"
    return 0
  fi
  local line=""
  for line in "${lines[@]}"; do
    printf '%s\n' "${line}"
  done
}

try_cmd() {
  local label="$1"
  shift
  section "${label}"
  set +e
  "$@" 2>&1 | redact_studio_stream
  local code=$?
  set -e
  if [[ "${code}" -ne 0 ]]; then
    printf 'BLOCKED exit=%s label=%s\n' "${code}" "${label}"
  fi
  return 0
}

docker_bin() {
  if [[ -n "${AUDIOLAD_DOCKER_BIN:-}" ]]; then
    printf '%s\n' "${AUDIOLAD_DOCKER_BIN}"
    return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    printf '%s\n' "docker"
    return 0
  fi
  return 1
}

is_proven_test_blob() {
  local blob
  blob="$(printf '%s' "$*" | tr '[:upper:]' '[:lower:]')"
  [[ "${blob}" == *6aa9fd82* ]] && return 0
  [[ "${blob}" == *synth_3h* ]] && return 0
  [[ "${blob}" == *synth_3h_le10800* ]] && return 0
  if [[ "${blob}" == *75-min* || "${blob}" == *75min* || "${blob}" == *75_min* ]]; then
    return 0
  fi
  return 1
}

audit_disk_before() {
  local mounts=""
  local out=""
  section "DISK BEFORE"
  echo "DISK BEFORE ="
  set +e
  out="$(df -h / ${DEPLOY_ROOT} /var/www "${AUDIT_TMP_DIR}" "${AUDIT_LOG_DIR}" 2>/dev/null)"
  set -e
  if [[ -n "${out}" ]]; then
    printf '%s\n' "${out}" | redact_studio_stream
    DISK_BEFORE_TEXT="${out}"
  else
    echo "df_unreadable"
    DISK_BEFORE_TEXT="df_unreadable"
  fi
  set +e
  mounts="$(findmnt -rno TARGET,FSTYPE,SIZE,USED,AVAIL,USE% / /var/www "${DEPLOY_ROOT}" 2>/dev/null)"
  set -e
  if [[ -n "${mounts}" ]]; then
    echo "findmnt<<"
    printf '%s\n' "${mounts}"
    echo ">>findmnt"
  fi
  set +e
  if docker_bin >/dev/null; then
    echo "docker_system_df<<"
    "$(docker_bin)" system df 2>&1 | redact_studio_stream
    echo ">>docker_system_df"
    echo "docker_volume_ls<<"
    "$(docker_bin)" volume ls 2>&1 | redact_studio_stream
    echo ">>docker_volume_ls"
  else
    echo "docker_unreadable_or_missing"
  fi
  set -e
  if [[ -d "${AUDIT_DOCKER_VOLUMES_DIR}" ]]; then
    if [[ -r "${AUDIT_DOCKER_VOLUMES_DIR}" ]]; then
      echo "docker_volumes_dir=${AUDIT_DOCKER_VOLUMES_DIR}"
      du -xh --max-depth=1 "${AUDIT_DOCKER_VOLUMES_DIR}" 2>/dev/null | sort -h | tail -n 20 || echo "docker_volumes_du_blocked"
    else
      echo "docker_volumes_dir_unreadable path=${AUDIT_DOCKER_VOLUMES_DIR}"
    fi
  fi
}

audit_largest_directories() {
  local path=""
  local out=""
  section "LARGEST DIRECTORIES"
  echo "LARGEST DIRECTORIES ="
  LARGEST_DIRS_TEXT=""
  for path in \
    "${DEPLOY_ROOT}" \
    "${AUDIT_TMP_DIR}" \
    "${AUDIT_LOG_DIR}" \
    "${AUDIT_PM2_LOG_DIR}" \
    "${AUDIT_TMP_DIR}"/audiolad-studio-* \
    "${AUDIT_TMP_DIR}"/audiolad-studio-*.wav \
    "${AUDIT_TMP_DIR}"/audiolad-studio-*.mp3 \
    "${AUDIT_TMP_DIR}"/audiolad-studio-*.webm
  do
    if [[ "${path}" == *'*'* ]]; then
      continue
    fi
    if [[ ! -e "${path}" ]]; then
      echo "missing path=${path}"
      continue
    fi
    if [[ ! -r "${path}" ]]; then
      echo "unreadable path=${path}"
      continue
    fi
    echo "du path=${path}"
    set +e
    out="$(du -xh --max-depth=2 "${path}" 2>/dev/null | sort -h | tail -n 40)"
    set -e
    if [[ -n "${out}" ]]; then
      printf '%s\n' "${out}"
      LARGEST_DIRS_TEXT+="${out}"$'\n'
    else
      echo "du_blocked path=${path}"
    fi
  done
  echo "studio_ffmpeg_temp_globs<<"
  set +e
  ls -ld "${AUDIT_TMP_DIR}"/audiolad-studio-* 2>/dev/null | redact_studio_stream
  set -e
  echo ">>studio_ffmpeg_temp_globs"
}

audit_log_sizes() {
  local path=""
  section "LOG SIZES"
  LOG_SIZES_TEXT=""
  for path in \
    "${AUDIT_PM2_LOG_DIR}" \
    "${AUDIT_NGINX_LOG_DIR}" \
    "${AUDIT_LOG_DIR}/nginx" \
    "${AUDIT_LOG_DIR}/audiolad" \
    "${AUDIT_LOG_DIR}/journal"
  do
    if [[ ! -e "${path}" ]]; then
      echo "missing path=${path}"
      continue
    fi
    if [[ ! -r "${path}" ]]; then
      echo "unreadable path=${path}"
      continue
    fi
    echo "log_path=${path} size=$(du -sh "${path}" 2>/dev/null | awk '{print $1}')"
    set +e
    du -xh --max-depth=1 "${path}" 2>/dev/null | sort -h | tail -n 20
    set -e
  done
  if command -v journalctl >/dev/null 2>&1; then
    set +e
    journalctl --disk-usage 2>&1 | redact_studio_stream
    set -e
  fi
}

audit_old_releases() {
  local current_real=""
  local previous_real=""
  local entry=""
  local real=""
  local name=""
  local size=""
  local bytes=""
  local mtime=""
  local mark=""
  section "OLD RELEASES FOUND"
  echo "OLD RELEASES FOUND ="
  if current_real="$(readlink -f "${CURRENT_LINK}" 2>/dev/null)" && [[ -n "${current_real}" ]]; then
    echo "CURRENT=$(basename "${current_real}") path=${current_real}"
  else
    current_real=""
    echo "CURRENT=UNKNOWN current_link_unreadable"
  fi
  if previous_real="$(readlink -f "${PREVIOUS_LINK}" 2>/dev/null)" && [[ -n "${previous_real}" ]]; then
    echo "PREVIOUS=$(basename "${previous_real}") path=${previous_real}"
  else
    previous_real=""
    echo "PREVIOUS=UNKNOWN previous_link_unreadable"
  fi
  echo "recommend_keep=current+previous_rollback"
  if [[ ! -d "${RELEASES_DIR}" ]]; then
    echo "releases_dir_missing path=${RELEASES_DIR}"
    return 0
  fi
  if [[ ! -r "${RELEASES_DIR}" ]]; then
    echo "releases_dir_unreadable path=${RELEASES_DIR}"
    return 0
  fi
  shopt -s nullglob
  for entry in "${RELEASES_DIR}"/*; do
    name="$(basename "${entry}")"
    real="$(readlink -f "${entry}" 2>/dev/null || printf '%s' "${entry}")"
    bytes="$(path_bytes "${entry}")"
    size="$(human_bytes "${bytes}")"
    mtime="$(stat -c '%y' "${entry}" 2>/dev/null || echo unknown)"
    mark="CANDIDATE"
    if [[ -n "${current_real}" && "${real}" == "${current_real}" ]]; then
      mark="CURRENT"
    elif [[ -n "${previous_real}" && "${real}" == "${previous_real}" ]]; then
      mark="PREVIOUS"
    fi
    OLD_RELEASE_LINES+=("release=${name} mark=${mark} size=${size} bytes=${bytes} mtime=${mtime} path=${entry}")
    printf '%s\n' "${OLD_RELEASE_LINES[-1]}"
    if [[ "${mark}" == "CANDIDATE" ]]; then
      add_safe_delete "${bytes}" "SAFE_TO_DELETE kind=release reason=older_than_current_and_previous size=${size} path=${entry}"
    fi
  done
  shopt -u nullglob
}

safe_find_test_names() {
  local root="$1"
  if [[ ! -d "${root}" || ! -r "${root}" ]]; then
    return 0
  fi
  set +e
  find "${root}" -xdev \
    \( -name node_modules -o -name .git -o -name '.next' \) -prune -o \
    -regextype posix-extended \
    \( -iname '*6aa9fd82*' -o -iname '*synth_3h*' -o -iname '*synth_3h_le10800*' \
       -o -iname '*10802*' -o -iname '*75-min*' -o -iname '*75min*' \
       -o -iname '*75_min*' \) \
    -print 2>/dev/null
  set -e
  return 0
}

audit_disk_test_orphans() {
  local root=""
  local found=""
  local path=""
  local bytes=""
  local size=""
  local blob=""
  section "TEST/ORPHAN FILES FOUND"
  echo "TEST/ORPHAN FILES FOUND ="
  for root in "${DEPLOY_ROOT}" "${AUDIT_TMP_DIR}" "${AUDIT_LOG_DIR}" "${AUDIT_PM2_LOG_DIR}"; do
    found="$(safe_find_test_names "${root}")"
    if [[ -z "${found}" ]]; then
      continue
    fi
    while IFS= read -r path; do
      [[ -n "${path}" ]] || continue
      bytes="$(path_bytes "${path}")"
      size="$(human_bytes "${bytes}")"
      blob="${path}"
      add_test_orphan "disk path=${path} size=${size} bytes=${bytes}"
      if is_proven_test_blob "${blob}"; then
        add_safe_delete "${bytes}" "SAFE_TO_DELETE kind=disk_test_fixture reason=proven_acceptance_name size=${size} path=${path}"
      else
        add_needs_review "NEEDS_REVIEW kind=disk_possible_fixture size=${size} path=${path}"
      fi
    done <<< "${found}"
  done
  shopt -s nullglob
  for path in "${AUDIT_TMP_DIR}"/audiolad-studio-*; do
    [[ -e "${path}" ]] || continue
    bytes="$(path_bytes "${path}")"
    size="$(human_bytes "${bytes}")"
    add_test_orphan "ffmpeg_temp path=${path} size=${size} bytes=${bytes}"
    if is_proven_test_blob "${path}"; then
      add_safe_delete "${bytes}" "SAFE_TO_DELETE kind=ffmpeg_temp reason=proven_acceptance_name size=${size} path=${path}"
    else
      add_needs_review "NEEDS_REVIEW kind=ffmpeg_temp_leftover size=${size} path=${path}"
    fi
  done
  shopt -u nullglob
}

run_db_storage_probe_docker() {
  local bin=""
  local raw=""
  local code=0
  if ! bin="$(docker_bin)"; then
    return 1
  fi
  set +e
  raw="$(
    "${bin}" exec "${DB_CONTAINER}" \
      psql -U postgres -d postgres -tA -F $'\t' -c \
      "SELECT 'project', id::text, coalesce(status,''), coalesce(deleted_at::text,''),
              CASE WHEN author_id IS NULL THEN 'NO' ELSE 'YES' END,
              coalesce(name,''), ''
         FROM public.studio_projects
        WHERE id::text LIKE '6aa9fd82%'
           OR name ILIKE '%synth_3h%'
           OR name ILIKE '%synth_3h_le10800%'
           OR name ILIKE '%10802%'
           OR name ILIKE '%75-min%'
           OR name ILIKE '%75min%';
       SELECT 'asset', id::text, project_id::text, coalesce(deleted_at::text,''),
              coalesce(storage_path,''), coalesce(original_name,''),
              coalesce(size_bytes::text,'0') || '|' || coalesce(duration_seconds::text,'')
         FROM public.studio_project_assets
        WHERE project_id::text LIKE '6aa9fd82%'
           OR storage_path ILIKE '%6aa9fd82%'
           OR storage_path ILIKE '%synth_3h%'
           OR original_name ILIKE '%synth_3h%'
           OR original_name ILIKE '%10802%'
           OR original_name ILIKE '%75-min%'
           OR original_name ILIKE '%75min%'
           OR duration_seconds BETWEEN 10700 AND 10900
           OR duration_seconds BETWEEN 4470 AND 4530
           OR size_bytes BETWEEN 330000000 AND 370000000;
       SELECT 'job', id::text, project_id::text, coalesce(status,''),
              coalesce(output_storage_path,''), '', ''
         FROM public.studio_render_jobs
        WHERE project_id::text LIKE '6aa9fd82%'
           OR coalesce(output_storage_path,'') ILIKE '%6aa9fd82%'
           OR coalesce(output_storage_path,'') ILIKE '%synth_3h%';
       SELECT 'storage', bucket_id, name, coalesce(metadata->>'size',''),
              '', '', ''
         FROM storage.objects
        WHERE bucket_id IN ('studio-draft-assets','studio-renders')
          AND (name ILIKE '%6aa9fd82%'
               OR name ILIKE '%synth_3h%'
               OR name ILIKE '%synth_3h_le10800%'
               OR name ILIKE '%10802%'
               OR name ILIKE '%75-min%'
               OR name ILIKE '%75min%');"
  )"
  code=$?
  set -e
  if [[ "${code}" -ne 0 || -z "${raw}" ]]; then
    return 1
  fi
  printf '%s\n' "${raw}" | redact_studio_stream
  return 0
}

run_db_storage_probe_node() {
  local dir="${CURRENT_LINK}"
  local probe=""
  local output=""
  local code=0
  if [[ ! -d "${dir}" ]]; then
    return 1
  fi
  probe="$(mktemp)"
  cat >"${probe}" <<'JS'
const silent = { info() {}, error() {} };
const dir = process.argv[2];
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(dir, false, silent, true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("DB_PROBE=UNAVAILABLE reason=missing_env");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const service = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const timer = setTimeout(() => {
  console.log("DB_PROBE=UNAVAILABLE reason=timeout");
  process.exit(2);
}, 25000);

function provenTest(parts) {
  const blob = parts.filter(Boolean).join(" ").toLowerCase();
  return (
    blob.includes("6aa9fd82") ||
    blob.includes("synth_3h") ||
    blob.includes("10802") ||
    /\b75[-_ ]?min/.test(blob)
  );
}

function emit(kind, fields) {
  const pairs = Object.entries(fields).map(([k, v]) => {
    const value = v == null ? "" : String(v).replace(/\s+/g, " ").slice(0, 240);
    return k + "=" + value;
  });
  console.log(["HIT", "kind=" + kind].concat(pairs).join(" "));
}

Promise.resolve()
  .then(async () => {
    const projectQueries = [
      service.from("studio_projects").select("id,status,deleted_at,author_id,name").ilike("name", "%synth_3h%"),
      service.from("studio_projects").select("id,status,deleted_at,author_id,name").ilike("name", "%10802%"),
      service.from("studio_projects").select("id,status,deleted_at,author_id,name").ilike("name", "%75-min%"),
      service.from("studio_projects").select("id,status,deleted_at,author_id,name").ilike("id", "6aa9fd82%"),
    ];
    const assetQueries = [
      service.from("studio_project_assets").select("id,project_id,storage_path,original_name,size_bytes,duration_seconds,deleted_at").ilike("storage_path", "%6aa9fd82%"),
      service.from("studio_project_assets").select("id,project_id,storage_path,original_name,size_bytes,duration_seconds,deleted_at").ilike("storage_path", "%synth_3h%"),
      service.from("studio_project_assets").select("id,project_id,storage_path,original_name,size_bytes,duration_seconds,deleted_at").ilike("original_name", "%synth_3h%"),
      service.from("studio_project_assets").select("id,project_id,storage_path,original_name,size_bytes,duration_seconds,deleted_at").ilike("original_name", "%75-min%"),
      service.from("studio_project_assets").select("id,project_id,storage_path,original_name,size_bytes,duration_seconds,deleted_at").gte("duration_seconds", 10700).lte("duration_seconds", 10900),
      service.from("studio_project_assets").select("id,project_id,storage_path,original_name,size_bytes,duration_seconds,deleted_at").gte("duration_seconds", 4470).lte("duration_seconds", 4530),
      service.from("studio_project_assets").select("id,project_id,storage_path,original_name,size_bytes,duration_seconds,deleted_at").gte("size_bytes", 330000000).lte("size_bytes", 370000000),
    ];
    const jobQueries = [
      service.from("studio_render_jobs").select("id,project_id,status,output_storage_path").ilike("output_storage_path", "%6aa9fd82%"),
      service.from("studio_render_jobs").select("id,project_id,status,output_storage_path").ilike("output_storage_path", "%synth_3h%"),
    ];
    const seen = new Set();
    for (const result of await Promise.allSettled([...projectQueries, ...assetQueries, ...jobQueries])) {
      if (result.status !== "fulfilled" || result.value.error || !Array.isArray(result.value.data)) continue;
      for (const row of result.value.data) {
        const kind = row.storage_path != null || row.original_name != null ? "asset" : row.output_storage_path != null || (row.status != null && row.project_id != null && row.name == null) ? "job" : "project";
        const key = kind + ":" + (row.id || "") + ":" + (row.storage_path || row.output_storage_path || row.name || "");
        if (seen.has(key)) continue;
        seen.add(key);
        const proven = provenTest([
          row.id,
          row.project_id,
          row.name,
          row.storage_path,
          row.original_name,
          row.output_storage_path,
        ]);
        const deleted = Boolean(row.deleted_at) || row.status === "deleted";
        const hasAuthor = Boolean(row.author_id);
        emit(kind, {
          id: row.id,
          project_id: row.project_id || "",
          status: row.status || "",
          deleted: deleted ? "YES" : "NO",
          has_author: hasAuthor ? "YES" : "NO",
          name: row.name || "",
          path: row.storage_path || row.output_storage_path || "",
          original_name: row.original_name || "",
          size_bytes: row.size_bytes || "",
          duration_seconds: row.duration_seconds || "",
          proven_test: proven ? "YES" : "NO",
        });
      }
    }
    const buckets = ["studio-draft-assets", "studio-renders"];
    const needles = ["6aa9fd82", "synth_3h", "synth_3h_le10800", "10802", "75-min", "75min"];
    const prefixes = ["", "studio", "studio/guest"];
    for (const bucket of buckets) {
      for (const prefix of prefixes) {
        for (const needle of needles) {
          try {
            const listed = await service.storage.from(bucket).list(prefix, { limit: 100, search: needle });
            if (listed.error || !Array.isArray(listed.data)) continue;
            for (const obj of listed.data) {
              const name = [prefix, obj.name].filter(Boolean).join("/");
              const size = obj.metadata && obj.metadata.size != null ? obj.metadata.size : obj.size || "";
              const proven = provenTest([name, obj.name]);
              const key = "storage:" + bucket + ":" + name;
              if (seen.has(key)) continue;
              seen.add(key);
              emit("storage", {
                bucket,
                path: name,
                size_bytes: size,
                proven_test: proven ? "YES" : "NO",
              });
            }
          } catch {
            // listing may fail for deploy; keep going
          }
        }
      }
    }
    console.log("DB_PROBE=OK");
    clearTimeout(timer);
  })
  .catch(() => {
    clearTimeout(timer);
    console.log("DB_PROBE=UNAVAILABLE reason=error");
    process.exit(2);
  });
JS
  set +e
  output="$(
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    export NODE_ENV=production
    export NODE_PATH="${dir}/node_modules${NODE_PATH:+:${NODE_PATH}}"
    cd "${dir}"
    node "${probe}" "${dir}" 2>/dev/null
  )"
  code=$?
  set -e
  rm -f "${probe}"
  output="$(printf '%s\n' "${output}" | redact_studio_stream)"
  if [[ "${code}" -ne 0 && "${output}" != *DB_PROBE=OK* ]]; then
    return 1
  fi
  printf '%s\n' "${output}"
  return 0
}

classify_probe_hits() {
  local line=""
  local kind=""
  local proven=""
  local deleted=""
  local has_author=""
  local path=""
  local size_bytes=""
  local id=""
  local status=""
  local name=""
  local original_name=""
  local blob=""
  while IFS= read -r line; do
    [[ -n "${line}" ]] || continue
    case "${line}" in
      HIT\ *)
        kind="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^kind=/) {sub(/^kind=/,"",$i); print $i; exit}}')"
        proven="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^proven_test=/) {sub(/^proven_test=/,"",$i); print $i; exit}}')"
        deleted="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^deleted=/) {sub(/^deleted=/,"",$i); print $i; exit}}')"
        has_author="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^has_author=/) {sub(/^has_author=/,"",$i); print $i; exit}}')"
        path="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^path=/) {sub(/^path=/,"",$i); print $i; exit}}')"
        size_bytes="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^size_bytes=/) {sub(/^size_bytes=/,"",$i); print $i; exit}}')"
        id="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^id=/) {sub(/^id=/,"",$i); print $i; exit}}')"
        status="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^status=/) {sub(/^status=/,"",$i); print $i; exit}}')"
        name="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^name=/) {sub(/^name=/,"",$i); print $i; exit}}')"
        original_name="$(printf '%s\n' "${line}" | awk '{for(i=1;i<=NF;i++) if($i ~ /^original_name=/) {sub(/^original_name=/,"",$i); print $i; exit}}')"
        blob="${id} ${path} ${name} ${original_name}"
        if [[ "${proven}" != "YES" ]] && is_proven_test_blob "${blob}"; then
          proven="YES"
        fi
        add_test_orphan "db_or_storage ${line}"
        if [[ "${has_author}" == "YES" && "${deleted}" != "YES" && "${status}" != "deleted" && "${proven}" != "YES" ]]; then
          add_needs_review "NEEDS_REVIEW kind=${kind} reason=possible_real_user_active id=${id} path=${path}"
          continue
        fi
        if [[ "${proven}" == "YES" && ( "${deleted}" == "YES" || "${status}" == "deleted" || -z "${status}" ) ]]; then
          add_safe_delete "${size_bytes:-0}" "SAFE_TO_DELETE kind=${kind} reason=proven_test_and_no_active_or_deleted id=${id} path=${path} size=$(human_bytes "${size_bytes:-0}")"
          continue
        fi
        if [[ "${proven}" == "YES" && "${deleted}" != "YES" && "${status}" != "deleted" && "${kind}" != "storage" ]]; then
          add_needs_review "NEEDS_REVIEW kind=${kind} reason=proven_test_but_active_reference id=${id} path=${path}"
          continue
        fi
        if [[ "${proven}" == "YES" && "${kind}" == "storage" ]]; then
          add_safe_delete "${size_bytes:-0}" "SAFE_TO_DELETE kind=storage reason=proven_acceptance_object id=${id} path=${path} size=$(human_bytes "${size_bytes:-0}")"
          continue
        fi
        add_needs_review "NEEDS_REVIEW kind=${kind} reason=uncertain_not_proven_test id=${id} path=${path}"
        ;;
      project*|asset*|job*|storage*)
        add_test_orphan "docker ${line}"
        if is_proven_test_blob "${line}"; then
          add_safe_delete 0 "SAFE_TO_DELETE kind=docker_row reason=proven_test line=$(printf '%s' "${line}" | tr '\t' ' ' | cut -c1-240)"
        else
          add_needs_review "NEEDS_REVIEW kind=docker_row reason=uncertain line=$(printf '%s' "${line}" | tr '\t' ' ' | cut -c1-240)"
        fi
        ;;
    esac
  done
}

audit_db_and_storage() {
  local probe=""
  section "DB AND STORAGE PROBE"
  echo "mode=read_only"
  echo "loadEnvConfig=presence_only_then_query"
  if probe="$(run_db_storage_probe_docker)"; then
    echo "db_probe=docker"
    printf '%s\n' "${probe}"
    classify_probe_hits <<< "${probe}"
    return 0
  fi
  echo "db_probe=docker_unavailable fallback=node"
  if probe="$(run_db_storage_probe_node)"; then
    echo "db_probe=node"
    printf '%s\n' "${probe}"
    classify_probe_hits <<< "${probe}"
    return 0
  fi
  echo "db_probe=unavailable"
  add_needs_review "NEEDS_REVIEW kind=db_storage_probe reason=unavailable"
  return 0
}

print_final_flags() {
  local recovery
  recovery="$(human_bytes "${SAFE_DELETE_BYTES}")"
  echo "DISK BEFORE = $(printf '%s' "${DISK_BEFORE_TEXT}" | awk 'NR==2{print; exit}')"
  echo "LARGEST DIRECTORIES = $(printf '%s' "${LARGEST_DIRS_TEXT}" | awk 'END{print}' )"
  echo "TEST/ORPHAN FILES FOUND = ${#TEST_ORPHAN_LINES[@]}"
  echo "OLD RELEASES FOUND = ${#OLD_RELEASE_LINES[@]}"
  echo "SAFE TO DELETE = ${#SAFE_DELETE_LINES[@]}"
  echo "ESTIMATED SPACE RECOVERY = ${recovery}"
  echo "CUTOVER = NO"
  echo "audiolad_deploy = NOT_INVOKED"
  echo "MODE = read_only_audit"
}

run_disk_storage_audit() {
  local current_real=""
  section "DISK_STORAGE_AUDIT"
  echo "mode=read_only_audit"
  echo "audiolad_deploy=NOT_INVOKED"
  echo "CUTOVER=NO"
  echo "ssh_user=$(id -un)"
  if [[ -n "${TARGET_SHA:-}" || -n "${ORIGIN_MAIN_SHA:-}" ]]; then
    section "REQUESTED_SHAS"
    echo "workflow_target_sha=${TARGET_SHA:-}"
    echo "workflow_origin_main_sha=${ORIGIN_MAIN_SHA:-}"
  fi
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

  section "CURRENT RELEASE"
  if current_real="$(readlink -f "${CURRENT_LINK}")" && [[ -n "${current_real}" ]]; then
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=${current_real}"
    echo "CURRENT RELEASE=$(basename "${current_real}")"
  else
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=BROKEN"
    echo "CURRENT RELEASE=UNKNOWN"
  fi

  audit_disk_before
  audit_largest_directories
  audit_log_sizes
  audit_old_releases
  audit_disk_test_orphans
  audit_db_and_storage

  section "TEST/ORPHAN FILES FOUND"
  echo "TEST/ORPHAN FILES FOUND ="
  print_list_or_none TEST_ORPHAN_LINES

  section "SAFE TO DELETE"
  echo "SAFE TO DELETE ="
  print_list_or_none SAFE_DELETE_LINES
  echo "note=releases_older_than_current_and_previous_only_for_release_kind"
  echo "note=studio_user_projects_never_marked_safe"

  section "NEEDS REVIEW"
  echo "NEEDS REVIEW ="
  print_list_or_none NEEDS_REVIEW_LINES

  section "ESTIMATED SPACE RECOVERY"
  echo "ESTIMATED SPACE RECOVERY = $(human_bytes "${SAFE_DELETE_BYTES}")"

  section "DISK_STORAGE_AUDIT_END"
  print_final_flags
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_disk_storage_audit
fi
