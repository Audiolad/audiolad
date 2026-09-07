#!/usr/bin/env bash
# One-shot hardcoded allowlist production disk/Storage cleanup for operators / GHA
# confirm=OPS_DISK_STORAGE_CLEANUP. Deletes ONLY the 13 SAFE TO DELETE items
# from audit run 34113627251. Never invokes audiolad-deploy / deploy.sh, never
# does nginx or current/previous symlink cutover, never prints env file
# contents or secret values, never restarts PM2 / nginx / Docker.
# Operator/local equivalent:
#   bash deploy/scripts/audiolad-disk-storage-cleanup.sh
set -Eeuo pipefail

if [[ "${#}" -ge 2 && "${1:-}" =~ ^[0-9a-f]{40}$ ]]; then
  TARGET_SHA="$1"
  ORIGIN_MAIN_SHA="$2"
  shift 2
fi

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
PREVIOUS_LINK="${DEPLOY_ROOT}/previous"
RELEASES_DIR="${DEPLOY_ROOT}/releases"
SHARED_ENV_PRODUCTION="${DEPLOY_ROOT}/shared/.env.production"
PM2_APP_NAME="audiolad-studio-render-worker"
CLEANUP_PROJECT_ID="6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4"
ALLOWLIST_RELEASE_A="20260906-113101-2acc27e1"
ALLOWLIST_RELEASE_B="20260907-064414-b85c870a"

CUTOVER="NO"
AUDIOLAD_DEPLOY="NOT_INVOKED"
MODE="allowlist_cleanup"
CLEANUP="PENDING"
CURRENT_RELEASE_INTACT="NO"
PREVIOUS_RELEASE_INTACT="NO"
REAL_USER_PROJECTS_UNTOUCHED="YES"
TEST_STORAGE_OBJECTS_REMOVED=0
TEST_DB_ROWS_CLEANED=0
WORKER_STATUS="UNKNOWN"
PUBLIC_HEALTH="UNKNOWN"
DISK_BEFORE_LINE=""
DISK_AFTER_LINE=""
SPACE_FREED="UNKNOWN"
DF_AVAIL_BEFORE=""
DF_AVAIL_AFTER=""
SAVED_CURRENT_NAME=""
SAVED_PREVIOUS_NAME=""
SAVED_CURRENT_REAL=""
SAVED_PREVIOUS_REAL=""
NEEDS_REVIEW_LINES=()
CLEANUP_TEMP_FILES=()
ALLOWLIST_MODULE=""

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

add_needs_review() {
  NEEDS_REVIEW_LINES+=("$1")
  printf '%s\n' "$1"
}

cleanup_temps() {
  local path=""
  for path in "${CLEANUP_TEMP_FILES[@]+"${CLEANUP_TEMP_FILES[@]}"}"; do
    rm -f "${path}"
  done
}
trap cleanup_temps EXIT

write_embedded_allowlist() {
  local dest="$1"
  cat >"${dest}" <<'ALLOWLIST_JS'
// Hardcoded one-shot allowlist for confirm=OPS_DISK_STORAGE_CLEANUP.
// Only the 13 SAFE TO DELETE items from audit run 34113627251.
// Pure gating: no I/O, no secrets, no remote calls.

export const CLEANUP_PROJECT_ID = "6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4";
export const CLEANUP_BUCKET = "studio-draft-assets";
export const AUDIT_RUN_ID = "34113627251";

export const ALLOWLIST_RELEASE_BASENAMES = Object.freeze([
  "20260906-113101-2acc27e1",
  "20260907-064414-b85c870a",
]);

export const ALLOWLIST_ORIGINAL_NAMES = Object.freeze([
  "real_75min.mp3",
  "synth_3h.mp3",
  "synth_over3h.mp3",
  "quota-a.mp3",
  "quota_probe_314572799.mp3",
  "quota-b.mp3",
  "synth_3h_le10800.mp3",
]);

export const ALLOWLIST_ASSETS = Object.freeze([
  { id: "800870b6-59cc-4f71-9df7-e30260723f83", originalName: "real_75min.mp3" },
  { id: "cd0c9ea3-d048-4adb-ab72-f29180bc3604", originalName: "synth_3h.mp3" },
  { id: "85a0809e-c82d-43bf-a629-a1cfdd67ca8b", originalName: "synth_over3h.mp3" },
  { id: "7f9b6997-ce1a-433c-b5ef-e734da5017c4", originalName: "quota-a.mp3" },
  { id: "29816d0c-13bf-4eb4-be5e-44c2b89dec66", originalName: "quota_probe_314572799.mp3" },
  { id: "8976a2e0-c0ef-48cf-9081-6a0572594130", originalName: "quota-b.mp3" },
  { id: "8f2d8683-138b-41c1-9db4-f3e85e679484", originalName: "synth_3h_le10800.mp3" },
  { id: "3e967669-06f2-4b6b-b68a-4cbc1840e991", originalName: "synth_over3h.mp3" },
  { id: "13729968-73c8-40f5-abba-3c5399f5b9cd", originalName: "synth_over3h.mp3" },
  { id: "1feacd09-5355-4bfa-8033-403f02b21e4d", originalName: "quota_probe_314572799.mp3" },
]);

export const REDACTED_ASSET_ID_PREFIX = "4fc1d620-aaff-44fe-9893-8ca27e29";
export const REDACTED_ASSET_ORIGINAL_NAME = "synth_over3h.mp3";

export const ALLOWLIST_ASSET_IDS = Object.freeze(ALLOWLIST_ASSETS.map((row) => row.id));

const EXPECTED_NAME_BY_ID = Object.freeze(
  Object.fromEntries(ALLOWLIST_ASSETS.map((row) => [row.id, row.originalName])),
);

export function expectedOriginalNameForAssetId(id) {
  return EXPECTED_NAME_BY_ID[id] || "";
}

export function isAllowlistedReleaseBasename(name) {
  return ALLOWLIST_RELEASE_BASENAMES.includes(String(name || ""));
}

export function isAllowlistedOriginalName(name) {
  return ALLOWLIST_ORIGINAL_NAMES.includes(String(name || ""));
}

export function isAllowlistedAssetId(id) {
  return ALLOWLIST_ASSET_IDS.includes(String(id || ""));
}

export function isRedactedAssetIdPrefix(id) {
  return String(id || "").startsWith(REDACTED_ASSET_ID_PREFIX);
}

export function isProvenTestBlob(parts) {
  const blob = (Array.isArray(parts) ? parts : [parts])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (blob.includes("6aa9fd82")) return true;
  if (blob.includes("synth_3h")) return true;
  if (blob.includes("synth_3h_le10800")) return true;
  if (blob.includes("10802")) return true;
  if (blob.includes("75-min") || blob.includes("75min") || blob.includes("75_min")) return true;
  if (/\b75[-_ ]?min/.test(blob)) return true;
  return false;
}

function normalizeDir(path) {
  return String(path || "").replace(/\/+$/, "");
}

export function evaluateReleaseDelete({
  basename,
  currentBasename,
  previousBasename,
  absolutePath,
  releasesDir,
}) {
  const name = String(basename || "");
  const current = String(currentBasename || "");
  const previous = String(previousBasename || "");
  const abs = normalizeDir(absolutePath);
  const root = normalizeDir(releasesDir);

  if (!isAllowlistedReleaseBasename(name)) {
    return { ok: false, reason: "basename_not_allowlisted" };
  }
  if (!current) {
    return { ok: false, reason: "current_unreadable" };
  }
  if (!previous) {
    return { ok: false, reason: "previous_unreadable" };
  }
  if (isAllowlistedReleaseBasename(current)) {
    return { ok: false, reason: "current_is_allowlisted" };
  }
  if (isAllowlistedReleaseBasename(previous)) {
    return { ok: false, reason: "previous_is_allowlisted" };
  }
  if (name === current) {
    return { ok: false, reason: "is_current" };
  }
  if (name === previous) {
    return { ok: false, reason: "is_previous" };
  }
  if (!root || !abs.startsWith(`${root}/`)) {
    return { ok: false, reason: "path_not_under_releases" };
  }
  const expected = `${root}/${name}`;
  if (abs !== expected) {
    return { ok: false, reason: "path_basename_mismatch" };
  }
  if (abs.includes("..") || name.includes("/") || name.includes("\\")) {
    return { ok: false, reason: "unsafe_path" };
  }
  return { ok: true, reason: "allowlisted_release" };
}

export function resolveRedactedAsset(rows) {
  const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || typeof row !== "object") return false;
    return (
      row.project_id === CLEANUP_PROJECT_ID &&
      isRedactedAssetIdPrefix(row.id) &&
      row.original_name === REDACTED_ASSET_ORIGINAL_NAME
    );
  });
  if (matches.length === 1) {
    return { ok: true, row: matches[0], reason: "redacted_unique" };
  }
  return {
    ok: false,
    row: null,
    rows: matches,
    reason: matches.length === 0 ? "redacted_not_found" : "redacted_not_unique",
  };
}

export function evaluateAssetDelete({ asset, project }) {
  if (!asset || !asset.id) {
    return { ok: false, reason: "missing_asset" };
  }
  if (asset.project_id !== CLEANUP_PROJECT_ID) {
    return { ok: false, reason: "project_id_mismatch" };
  }
  if (project && project.id && project.id !== CLEANUP_PROJECT_ID) {
    return { ok: false, reason: "project_row_id_mismatch" };
  }
  const expectedName = expectedOriginalNameForAssetId(asset.id);
  if (expectedName && asset.original_name !== expectedName) {
    return { ok: false, reason: "original_name_mismatch_for_id" };
  }
  if (!expectedName && !isRedactedAssetIdPrefix(asset.id)) {
    return { ok: false, reason: "id_not_allowlisted" };
  }
  if (!isAllowlistedOriginalName(asset.original_name)) {
    return { ok: false, reason: "original_name_not_allowlisted" };
  }
  const storagePath = String(asset.storage_path || "");
  if (!storagePath.includes(CLEANUP_PROJECT_ID) || !storagePath.includes(String(asset.id))) {
    return { ok: false, reason: "storage_path_missing_ids" };
  }
  if (Boolean(project && project.author_id)) {
    return { ok: false, reason: "has_real_user_author" };
  }
  if (!isProvenTestBlob([
    asset.id,
    asset.project_id,
    asset.original_name,
    asset.storage_path,
    project && project.name,
    project && project.id,
  ])) {
    return { ok: false, reason: "not_proven_test" };
  }
  return { ok: true, reason: "allowlisted_asset" };
}

export function evaluateStorageDelete({ storagePath, sourceId, otherAssets }) {
  const path = String(storagePath || "");
  const source = sourceId || "";
  const blockers = (Array.isArray(otherAssets) ? otherAssets : []).filter((row) => {
    if (!row || !row.id) return false;
    if (isAllowlistedAssetId(row.id) || isRedactedAssetIdPrefix(row.id)) return false;
    return row.storage_path === path || (source && row.source_id === source);
  });
  if (blockers.length) {
    return { ok: false, reason: "shared_with_non_allowlisted_asset", blockers };
  }
  return { ok: true, reason: "storage_unshared" };
}

export function evaluateRenderJobDelete({ job }) {
  if (!job || job.project_id !== CLEANUP_PROJECT_ID) {
    return { ok: false, reason: "job_other_project" };
  }
  if (job.status === "processing") {
    return { ok: false, reason: "job_processing" };
  }
  const output = String(job.output_storage_path || "");
  if (output && !isProvenTestBlob([output])) {
    return { ok: false, reason: "job_output_not_proven" };
  }
  return { ok: true, reason: "proven_test_job" };
}

export function evaluateProjectDelete({ project, remainingAssetCount }) {
  if (!project || project.id !== CLEANUP_PROJECT_ID) {
    return { ok: false, reason: "wrong_project" };
  }
  if (remainingAssetCount !== 0) {
    return { ok: false, reason: "assets_remain" };
  }
  if (project.author_id) {
    return { ok: false, reason: "has_author" };
  }
  const name = String(project.name || "").trim();
  if (name && !isProvenTestBlob([name])) {
    return { ok: false, reason: "name_not_acceptance" };
  }
  return { ok: true, reason: "acceptance_only_empty" };
}

export function evaluateClipCascade({ clipRefs, allowlistedIds }) {
  const ids = new Set((allowlistedIds || []).map(String));
  const refs = Array.isArray(clipRefs) ? clipRefs : [];
  const foreign = refs.filter((ref) => {
    const assetId = ref && (ref.asset_id || ref.assetId);
    return assetId && !ids.has(String(assetId));
  });
  if (foreign.length) {
    return { ok: false, reason: "clip_refs_foreign_assets", foreign };
  }
  if (refs.length === 0) {
    return { ok: false, reason: "no_clip_table_skip_cascade" };
  }
  const owned = refs.every((ref) => ids.has(String(ref.asset_id || ref.assetId)));
  return owned
    ? { ok: true, reason: "clip_refs_only_allowlisted" }
    : { ok: false, reason: "clip_refs_uncertain" };
}
ALLOWLIST_JS
}

resolve_allowlist_module() {
  local script_path="${BASH_SOURCE[0]:-}"
  local script_dir=""
  local tmp=""
  if [[ -n "${script_path}" && -f "${script_path}" ]]; then
    script_dir="$(cd "$(dirname "${script_path}")" && pwd)"
    if [[ -f "${script_dir}/lib/disk-storage-cleanup-allowlist.mjs" ]]; then
      printf '%s\n' "${script_dir}/lib/disk-storage-cleanup-allowlist.mjs"
      return 0
    fi
  fi
  tmp="$(mktemp /tmp/audiolad-disk-cleanup-allowlist.XXXXXX.mjs)"
  CLEANUP_TEMP_FILES+=("${tmp}")
  write_embedded_allowlist "${tmp}"
  printf '%s\n' "${tmp}"
}

df_root_avail_kb() {
  df -P / 2>/dev/null | awk 'NR==2 {print $4; exit}'
}

df_root_line() {
  df -h / 2>/dev/null | awk 'NR==2 {print; exit}'
}

human_kb() {
  local kb="${1:-0}"
  if ! [[ "${kb}" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "UNKNOWN"
    return 0
  fi
  awk -v k="${kb}" 'BEGIN {
    b = k * 1024
    if (b < 1024) { printf "%sB\n", b; exit }
    split("K M G T", u)
    n = b
    i = 0
    while (n >= 1024 && i < 4) { n = n / 1024; i++ }
    if (n >= 10) printf "%.0f%s\n", n, u[i]
    else printf "%.1f%s\n", n, u[i]
  }'
}

gate_release() {
  local name="$1"
  local current="$2"
  local previous="$3"
  local path="$4"
  local output=""
  local code=0
  REL_NAME="${name}" \
  REL_CURRENT="${current}" \
  REL_PREVIOUS="${previous}" \
  REL_PATH="${path}" \
  REL_RELEASES_DIR="${RELEASES_DIR}" \
  ALLOWLIST_MODULE="${ALLOWLIST_MODULE}" \
  node --input-type=module -e '
import { pathToFileURL } from "node:url";
try {
  const href = pathToFileURL(process.env.ALLOWLIST_MODULE).href;
  const mod = await import(href);
  const r = mod.evaluateReleaseDelete({
    basename: process.env.REL_NAME,
    currentBasename: process.env.REL_CURRENT,
    previousBasename: process.env.REL_PREVIOUS,
    absolutePath: process.env.REL_PATH,
    releasesDir: process.env.REL_RELEASES_DIR,
  });
  console.log("RELEASE_GATE=" + (r.ok ? "YES" : "NO") + " reason=" + r.reason);
  process.exit(r.ok ? 0 : 1);
} catch (err) {
  const message = err && err.message ? String(err.message) : String(err);
  console.log("RELEASE_GATE=NO reason=allowlist_import_failed");
  console.error(message.slice(0, 400));
  process.exit(1);
}
'
}

delete_allowlisted_release() {
  local name="$1"
  local current="$2"
  local previous="$3"
  local path="${RELEASES_DIR}/${name}"
  local gate=""
  echo "release_candidate=${name} path=${path}"
  if [[ ! -d "${path}" ]]; then
    echo "release_already_absent name=${name}"
    return 0
  fi
  set +e
  gate="$(gate_release "${name}" "${current}" "${previous}" "${path}" 2>&1)"
  local code=$?
  set -e
  printf '%s\n' "${gate}" | redact_studio_stream
  if [[ "${code}" -ne 0 ]]; then
    add_needs_review "NEEDS_REVIEW kind=release reason=gate_failed name=${name}"
    CLEANUP="FAILED"
    return 0
  fi
  if [[ "${path}" != "${RELEASES_DIR}/${name}" || "${name}" == *'/'* || "${name}" == *'..'* ]]; then
    add_needs_review "NEEDS_REVIEW kind=release reason=unsafe_path name=${name}"
    CLEANUP="FAILED"
    return 0
  fi
  if [[ "${path}" == "${SAVED_CURRENT_REAL}" || "${path}" == "${SAVED_PREVIOUS_REAL}" ]]; then
    add_needs_review "NEEDS_REVIEW kind=release reason=points_at_current_or_previous name=${name}"
    CLEANUP="FAILED"
    return 0
  fi
  echo "rm -rf allowlisted release dir only name=${name}"
  rm -rf -- "${path}"
  if [[ -e "${path}" ]]; then
    add_needs_review "NEEDS_REVIEW kind=release reason=rm_failed name=${name}"
    CLEANUP="FAILED"
    return 0
  fi
  echo "release_deleted name=${name}"
}

run_asset_cleanup_probe() {
  local dir="${CURRENT_LINK}"
  local probe=""
  local output=""
  local code=0
  if [[ ! -d "${dir}" ]]; then
    echo "ASSET_CLEANUP=UNAVAILABLE reason=current_dir_missing"
    CLEANUP="FAILED"
    return 0
  fi
  probe="$(mktemp)"
  CLEANUP_TEMP_FILES+=("${probe}")
  cat >"${probe}" <<'JS'
const silent = { info() {}, error() {} };
const path = require("path");
const { pathToFileURL } = require("url");
const dir = process.argv[2];
const allowlistPath = process.argv[3];
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(dir, false, silent, true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("ASSET_CLEANUP=UNAVAILABLE reason=missing_env");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const service = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function emit(line) {
  console.log(line);
}

Promise.resolve()
  .then(async () => {
    const allowlist = await import(pathToFileURL(path.resolve(allowlistPath)).href);
    const projectId = allowlist.CLEANUP_PROJECT_ID;
    const bucket = allowlist.CLEANUP_BUCKET;
    let storageRemoved = 0;
    let dbCleaned = 0;
    let failed = false;
    let realUserUntouched = true;

    const projectResult = await service
      .from("studio_projects")
      .select("id,author_id,name,status,deleted_at,guest_session_id,project_data")
      .eq("id", projectId)
      .maybeSingle();
    if (projectResult.error) {
      emit("NEEDS_REVIEW kind=project reason=project_lookup_failed");
      emit("ASSET_CLEANUP=FAILED");
      process.exit(2);
    }
    const project = projectResult.data;
    if (!project) {
      emit("project_already_absent id=" + projectId);
    } else if (project.author_id) {
      emit("NEEDS_REVIEW kind=project reason=has_real_user_author id=" + projectId);
      emit("REAL_USER_PROJECTS_UNTOUCHED=YES");
      emit("ASSET_CLEANUP=FAILED");
      process.exit(2);
    }

    const knownAssets = [];
    for (const item of allowlist.ALLOWLIST_ASSETS) {
      const fetched = await service
        .from("studio_project_assets")
        .select("id,project_id,storage_path,original_name,size_bytes,source_id,deleted_at")
        .eq("id", item.id)
        .eq("project_id", projectId)
        .maybeSingle();
      if (fetched.error) {
        emit("NEEDS_REVIEW kind=asset reason=lookup_failed id=" + item.id);
        failed = true;
        continue;
      }
      if (!fetched.data) {
        emit("asset_already_absent id=" + item.id + " original_name=" + item.originalName);
        continue;
      }
      knownAssets.push(fetched.data);
    }

    const redactedQuery = await service
      .from("studio_project_assets")
      .select("id,project_id,storage_path,original_name,size_bytes,source_id,deleted_at")
      .eq("project_id", projectId)
      .eq("original_name", allowlist.REDACTED_ASSET_ORIGINAL_NAME);
    if (redactedQuery.error) {
      emit("NEEDS_REVIEW kind=asset reason=redacted_lookup_failed");
      failed = true;
    } else {
      const resolved = allowlist.resolveRedactedAsset(redactedQuery.data || []);
      if (!resolved.ok) {
        emit("NEEDS_REVIEW kind=asset reason=" + resolved.reason + " prefix=" + allowlist.REDACTED_ASSET_ID_PREFIX);
        failed = true;
      } else {
        knownAssets.push(resolved.row);
        emit("redacted_resolved id=" + resolved.row.id);
      }
    }

    const clipDecision = allowlist.evaluateClipCascade({
      clipRefs: [],
      allowlistedIds: [
        ...allowlist.ALLOWLIST_ASSET_IDS,
        ...knownAssets.filter((row) => allowlist.isRedactedAssetIdPrefix(row.id)).map((row) => row.id),
      ],
    });
    emit("CLIP_CASCADE=" + clipDecision.reason);
    emit("note=no_studio_clips_table_project_data_left_unchanged");

    for (const asset of knownAssets) {
      const gate = allowlist.evaluateAssetDelete({ asset, project });
      if (!gate.ok) {
        emit("NEEDS_REVIEW kind=asset reason=" + gate.reason + " id=" + asset.id);
        failed = true;
        continue;
      }
      const bySource = asset.source_id
        ? await service
            .from("studio_project_assets")
            .select("id,project_id,storage_path,source_id")
            .eq("source_id", asset.source_id)
        : { data: [], error: null };
      const byPath = await service
        .from("studio_project_assets")
        .select("id,project_id,storage_path,source_id")
        .eq("storage_path", asset.storage_path);
      if (bySource.error || byPath.error) {
        emit("NEEDS_REVIEW kind=asset reason=shared_lookup_failed id=" + asset.id);
        failed = true;
        continue;
      }
      const otherRows = [...(bySource.data || []), ...(byPath.data || [])];
      const foreignShare = otherRows.some((row) => row.project_id && row.project_id !== projectId);
      if (foreignShare) {
        realUserUntouched = false;
        emit("NEEDS_REVIEW kind=asset reason=shared_with_other_project id=" + asset.id);
        failed = true;
        continue;
      }
      const storageGate = allowlist.evaluateStorageDelete({
        storagePath: asset.storage_path,
        sourceId: asset.source_id,
        otherAssets: otherRows,
      });
      if (!storageGate.ok) {
        emit("NEEDS_REVIEW kind=asset reason=" + storageGate.reason + " id=" + asset.id);
        failed = true;
        continue;
      }
      const removed = await service.storage.from(bucket).remove([asset.storage_path]);
      if (removed.error) {
        emit("NEEDS_REVIEW kind=storage reason=remove_failed id=" + asset.id);
        failed = true;
        continue;
      }
      storageRemoved += 1;
      emit("storage_removed bucket=" + bucket + " path=" + asset.storage_path);
      const deleted = await service
        .from("studio_project_assets")
        .delete()
        .eq("id", asset.id)
        .eq("project_id", projectId);
      if (deleted.error) {
        emit("NEEDS_REVIEW kind=asset reason=db_delete_failed id=" + asset.id);
        failed = true;
        continue;
      }
      dbCleaned += 1;
      emit("asset_row_deleted id=" + asset.id);
      if (asset.source_id) {
        const remaining = await service
          .from("studio_project_assets")
          .select("id", { count: "exact", head: true })
          .eq("source_id", asset.source_id);
        if (!remaining.error && remaining.count === 0) {
          const sourceDeleted = await service
            .from("studio_asset_sources")
            .delete()
            .eq("id", asset.source_id);
          if (sourceDeleted.error) {
            emit("note=source_row_left id=" + asset.source_id + " reason=delete_failed_or_restricted");
          } else {
            dbCleaned += 1;
            emit("source_row_deleted id=" + asset.source_id);
          }
        }
      }
    }

    const jobs = await service
      .from("studio_render_jobs")
      .select("id,project_id,status,output_storage_path")
      .eq("project_id", projectId);
    if (jobs.error) {
      emit("note=render_jobs_lookup_failed left_in_place");
    } else {
      for (const job of jobs.data || []) {
        const jobGate = allowlist.evaluateRenderJobDelete({ job });
        if (!jobGate.ok) {
          emit("note=render_job_left id=" + job.id + " reason=" + jobGate.reason);
          continue;
        }
        const jobDeleted = await service
          .from("studio_render_jobs")
          .delete()
          .eq("id", job.id)
          .eq("project_id", projectId);
        if (jobDeleted.error) {
          emit("note=render_job_left id=" + job.id + " reason=delete_failed");
        } else {
          dbCleaned += 1;
          emit("render_job_deleted id=" + job.id);
        }
      }
    }

    const remainingAssets = await service
      .from("studio_project_assets")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    const remainingCount = remainingAssets.error ? -1 : remainingAssets.count;
    emit("remaining_assets=" + remainingCount);
    if (project && remainingCount === 0) {
      const projectGate = allowlist.evaluateProjectDelete({
        project,
        remainingAssetCount: remainingCount,
      });
      if (projectGate.ok) {
        const projectDeleted = await service.from("studio_projects").delete().eq("id", projectId);
        if (projectDeleted.error) {
          emit("note=project_left id=" + projectId + " reason=delete_failed");
        } else {
          dbCleaned += 1;
          emit("project_deleted id=" + projectId);
        }
      } else {
        emit("note=project_left id=" + projectId + " reason=" + projectGate.reason);
      }
    } else if (project) {
      emit("note=project_left id=" + projectId + " reason=assets_or_count_unknown");
    }

    emit("TEST_STORAGE_OBJECTS_REMOVED=" + storageRemoved);
    emit("TEST_DB_ROWS_CLEANED=" + dbCleaned);
    emit("REAL_USER_PROJECTS_UNTOUCHED=" + (realUserUntouched ? "YES" : "NO"));
    emit("ASSET_CLEANUP=" + (failed ? "FAILED" : "OK"));
    if (failed) process.exit(2);
  })
  .catch((err) => {
    const message = err && err.message ? String(err.message) : String(err);
    console.log("ASSET_CLEANUP=UNAVAILABLE reason=error");
    console.log("ASSET_CLEANUP_ERROR=" + message.replace(/\s+/g, " ").slice(0, 400));
    process.exit(2);
  });
JS
  set +e
  output="$(
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    export NODE_ENV=production
    export NODE_PATH="${dir}/node_modules${NODE_PATH:+:${NODE_PATH}}"
    cd "${dir}"
    node "${probe}" "${dir}" "${ALLOWLIST_MODULE}" 2>&1
  )"
  code=$?
  set -e
  output="$(printf '%s\n' "${output}" | redact_studio_stream)"
  printf '%s\n' "${output}"
  local line=""
  while IFS= read -r line; do
    case "${line}" in
      TEST_STORAGE_OBJECTS_REMOVED=[0-9]*)
        TEST_STORAGE_OBJECTS_REMOVED="${line#TEST_STORAGE_OBJECTS_REMOVED=}"
        ;;
      TEST_DB_ROWS_CLEANED=[0-9]*)
        TEST_DB_ROWS_CLEANED="${line#TEST_DB_ROWS_CLEANED=}"
        ;;
      REAL_USER_PROJECTS_UNTOUCHED=YES|REAL_USER_PROJECTS_UNTOUCHED=NO)
        REAL_USER_PROJECTS_UNTOUCHED="${line#REAL_USER_PROJECTS_UNTOUCHED=}"
        ;;
      NEEDS_REVIEW\ *)
        NEEDS_REVIEW_LINES+=("${line}")
        ;;
      ASSET_CLEANUP=FAILED|ASSET_CLEANUP=UNAVAILABLE*)
        CLEANUP="FAILED"
        ;;
    esac
  done <<< "${output}"
  if [[ "${code}" -ne 0 ]]; then
    CLEANUP="FAILED"
  fi
  return 0
}

read_worker_status() {
  if ! command -v pm2 >/dev/null 2>&1; then
    WORKER_STATUS="pm2_not_found"
    echo "WORKER STATUS = ${WORKER_STATUS}"
    return 0
  fi
  set +e
  pm2 status "${PM2_APP_NAME}" 2>&1 | redact_studio_stream
  set -e
  local fields=""
  if command -v python3 >/dev/null 2>&1; then
    set +e
    fields="$(
      pm2 jlist 2>/dev/null | python3 -c '
import json, sys
name = "audiolad-studio-render-worker"
try:
    procs = json.load(sys.stdin)
except Exception:
    print("missing")
    raise SystemExit(0)
if not isinstance(procs, list):
    print("missing")
    raise SystemExit(0)
for proc in procs:
    if not isinstance(proc, dict) or proc.get("name") != name:
        continue
    env = proc.get("pm2_env") if isinstance(proc.get("pm2_env"), dict) else {}
    print(env.get("status", "unknown"))
    raise SystemExit(0)
print("missing")
'
    )"
    set -e
  fi
  WORKER_STATUS="${fields:-unknown}"
  echo "WORKER STATUS = ${WORKER_STATUS}"
}

read_public_health() {
  local raw=""
  set +e
  raw="$(curl -fsS https://audiolad.ru/api/health/build 2>/dev/null)"
  local code=$?
  set -e
  raw="$(printf '%s\n' "${raw}" | redact_studio_stream)"
  if [[ "${code}" -eq 0 && -n "${raw}" ]]; then
    printf '%s\n' "${raw}"
    if [[ "${raw}" == *'"status":"ok"'* || "${raw}" == *'"status": "ok"'* ]]; then
      PUBLIC_HEALTH="ok"
    else
      PUBLIC_HEALTH="unexpected"
    fi
  else
    echo "health_build_fetch_failed"
    PUBLIC_HEALTH="failed"
  fi
  echo "PUBLIC HEALTH = ${PUBLIC_HEALTH}"
}

verify_release_intact() {
  local saved_name="$1"
  local saved_real="$2"
  local link="$3"
  local now_real=""
  if [[ -z "${saved_name}" || -z "${saved_real}" ]]; then
    printf '%s\n' "NO"
    return 0
  fi
  if now_real="$(readlink -f "${link}" 2>/dev/null)" && [[ -n "${now_real}" && -d "${now_real}" ]]; then
    if [[ "${now_real}" == "${saved_real}" && "$(basename "${now_real}")" == "${saved_name}" ]]; then
      printf '%s\n' "YES"
      return 0
    fi
  fi
  printf '%s\n' "NO"
}

print_final_flags() {
  echo "DISK AFTER = ${DISK_AFTER_LINE}"
  echo "SPACE FREED = ${SPACE_FREED}"
  echo "CURRENT RELEASE INTACT = ${CURRENT_RELEASE_INTACT}"
  echo "PREVIOUS RELEASE INTACT = ${PREVIOUS_RELEASE_INTACT}"
  echo "REAL USER PROJECTS UNTOUCHED = ${REAL_USER_PROJECTS_UNTOUCHED}"
  echo "TEST STORAGE OBJECTS REMOVED = ${TEST_STORAGE_OBJECTS_REMOVED}"
  echo "TEST DB ROWS CLEANED = ${TEST_DB_ROWS_CLEANED}"
  echo "WORKER STATUS = ${WORKER_STATUS}"
  echo "PUBLIC HEALTH = ${PUBLIC_HEALTH}"
  echo "CLEANUP = ${CLEANUP}"
  echo "CUTOVER = NO"
  echo "MODE = allowlist_cleanup"
  echo "CUTOVER=NO"
  echo "audiolad_deploy = ${AUDIOLAD_DEPLOY}"
}

run_disk_storage_cleanup() {
  local current_real=""
  local previous_real=""
  local asset_ok=0
  ALLOWLIST_MODULE="$(resolve_allowlist_module)"
  echo "allowlist_module=${ALLOWLIST_MODULE}"
  if [[ "${ALLOWLIST_MODULE}" != *.mjs ]]; then
    echo "NEEDS_REVIEW kind=allowlist reason=temp_path_missing_mjs path=${ALLOWLIST_MODULE}"
    CLEANUP="FAILED"
    print_final_flags
    return 1
  fi

  section "DISK_STORAGE_CLEANUP"
  echo "mode=allowlist_cleanup"
  echo "confirm=OPS_DISK_STORAGE_CLEANUP"
  echo "audiolad_deploy=NOT_INVOKED"
  echo "CUTOVER=NO"
  echo "ssh_user=$(id -un)"
  if [[ -n "${TARGET_SHA:-}" || -n "${ORIGIN_MAIN_SHA:-}" ]]; then
    section "REQUESTED_SHAS"
    echo "workflow_target_sha=${TARGET_SHA:-}"
    echo "workflow_origin_main_sha=${ORIGIN_MAIN_SHA:-}"
  fi
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

  section "CURRENT AND PREVIOUS"
  if current_real="$(readlink -f "${CURRENT_LINK}")" && [[ -n "${current_real}" && -d "${current_real}" ]]; then
    SAVED_CURRENT_REAL="${current_real}"
    SAVED_CURRENT_NAME="$(basename "${current_real}")"
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=${current_real}"
    echo "CURRENT RELEASE=${SAVED_CURRENT_NAME}"
  else
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=BROKEN"
    echo "CURRENT RELEASE=UNKNOWN"
    add_needs_review "NEEDS_REVIEW kind=release reason=current_unreadable"
  fi
  if previous_real="$(readlink -f "${PREVIOUS_LINK}")" && [[ -n "${previous_real}" && -d "${previous_real}" ]]; then
    SAVED_PREVIOUS_REAL="${previous_real}"
    SAVED_PREVIOUS_NAME="$(basename "${previous_real}")"
    echo "previous_link=${PREVIOUS_LINK}"
    echo "previous_realpath=${previous_real}"
    echo "PREVIOUS RELEASE=${SAVED_PREVIOUS_NAME}"
  else
    echo "previous_link=${PREVIOUS_LINK}"
    echo "previous_realpath=BROKEN"
    echo "PREVIOUS RELEASE=UNKNOWN"
    add_needs_review "NEEDS_REVIEW kind=release reason=previous_unreadable"
  fi
  echo "shared_env_path=${SHARED_ENV_PRODUCTION} exists=$([[ -e "${SHARED_ENV_PRODUCTION}" ]] && echo YES || echo NO)"
  echo "note=shared_env_production_not_read_or_deleted"

  section "DISK BEFORE"
  DISK_BEFORE_LINE="$(df_root_line)"
  DF_AVAIL_BEFORE="$(df_root_avail_kb)"
  echo "DISK BEFORE = ${DISK_BEFORE_LINE}"

  section "ALLOWLIST RELEASES"
  echo "allowlist=${ALLOWLIST_RELEASE_A} ${ALLOWLIST_RELEASE_B}"
  delete_allowlisted_release "${ALLOWLIST_RELEASE_A}" "${SAVED_CURRENT_NAME}" "${SAVED_PREVIOUS_NAME}"
  delete_allowlisted_release "${ALLOWLIST_RELEASE_B}" "${SAVED_CURRENT_NAME}" "${SAVED_PREVIOUS_NAME}"

  section "ALLOWLIST ASSETS"
  echo "project_id=${CLEANUP_PROJECT_ID}"
  echo "bucket=studio-draft-assets"
  set +e
  run_asset_cleanup_probe
  asset_ok=$?
  set -e
  if [[ "${asset_ok}" -ne 0 ]]; then
    CLEANUP="FAILED"
  fi

  section "POST CHECKS"
  DISK_AFTER_LINE="$(df_root_line)"
  DF_AVAIL_AFTER="$(df_root_avail_kb)"
  echo "DISK AFTER = ${DISK_AFTER_LINE}"
  if [[ "${DF_AVAIL_BEFORE}" =~ ^[0-9]+$ && "${DF_AVAIL_AFTER}" =~ ^[0-9]+$ ]]; then
    if (( DF_AVAIL_AFTER >= DF_AVAIL_BEFORE )); then
      SPACE_FREED="$(human_kb "$((DF_AVAIL_AFTER - DF_AVAIL_BEFORE))")"
    else
      SPACE_FREED="0"
    fi
  fi
  echo "SPACE FREED = ${SPACE_FREED}"
  CURRENT_RELEASE_INTACT="$(verify_release_intact "${SAVED_CURRENT_NAME}" "${SAVED_CURRENT_REAL}" "${CURRENT_LINK}")"
  PREVIOUS_RELEASE_INTACT="$(verify_release_intact "${SAVED_PREVIOUS_NAME}" "${SAVED_PREVIOUS_REAL}" "${PREVIOUS_LINK}")"
  echo "CURRENT RELEASE INTACT = ${CURRENT_RELEASE_INTACT}"
  echo "PREVIOUS RELEASE INTACT = ${PREVIOUS_RELEASE_INTACT}"
  if [[ -e "${SHARED_ENV_PRODUCTION}" ]]; then
    echo "shared_env_intact=YES"
  else
    echo "shared_env_intact=NO"
    CLEANUP="FAILED"
    REAL_USER_PROJECTS_UNTOUCHED="NO"
  fi
  if [[ -d "${RELEASES_DIR}/${SAVED_CURRENT_NAME}" && -d "${RELEASES_DIR}/${SAVED_PREVIOUS_NAME}" ]]; then
    echo "current_previous_dirs_present=YES"
  else
    echo "current_previous_dirs_present=NO"
    CLEANUP="FAILED"
  fi

  section "WORKER STATUS"
  read_worker_status

  section "PUBLIC HEALTH"
  read_public_health

  section "NEEDS REVIEW"
  if ((${#NEEDS_REVIEW_LINES[@]} == 0)); then
    echo "(none)"
  else
    local review=""
    for review in "${NEEDS_REVIEW_LINES[@]}"; do
      printf '%s\n' "${review}"
    done
    CLEANUP="FAILED"
  fi

  if [[ "${CURRENT_RELEASE_INTACT}" == "YES" && "${PREVIOUS_RELEASE_INTACT}" == "YES" && "${REAL_USER_PROJECTS_UNTOUCHED}" == "YES" && "${#NEEDS_REVIEW_LINES[@]}" -eq 0 && "${CLEANUP}" != "FAILED" ]]; then
    CLEANUP="SUCCESS"
  else
    CLEANUP="FAILED"
  fi

  section "DISK_STORAGE_CLEANUP_END"
  print_final_flags
  if [[ "${CLEANUP}" != "SUCCESS" ]]; then
    return 1
  fi
  return 0
}

run_disk_storage_cleanup
