#!/usr/bin/env bash
# Read-only Studio duplicate-asset diagnostic for operators / GHA
# confirm=OPS_STUDIO_DUPLICATE_ASSET_DIAG. Never writes DB/Storage rows,
# never creates signed URLs, never invokes audiolad-deploy / deploy.sh,
# never does nginx or current/previous symlink cutover, never prints env
# file contents, secret values, full URLs, or keys. Prints supabase host only.
# Loads shared/.env.production through current-release loadEnvConfig +
# supabase-js service role, same as recover / disk audit. Do not source
# .env.production in this shell.
set -Eeuo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
SHARED_ENV_PRODUCTION="${DEPLOY_ROOT}/shared/.env.production"
BROKEN_PROJECT_ID="${AUDIOLAD_DUP_ASSET_PROJECT_ID:-3832ded1-4100-447e-a8d4-7fc6a635f72e}"

CUTOVER="NO"
AUDIOLAD_DEPLOY="NOT_INVOKED"
MODE="read_only_duplicate_asset_diag"

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

run_duplicate_asset_diag_node() {
  local dir="${CURRENT_LINK}"
  local probe=""
  local output=""
  local code=0
  if [[ ! -d "${dir}" ]]; then
    echo "DIAG_PROBE=UNAVAILABLE reason=current_release_missing"
    return 1
  fi
  probe="$(mktemp /tmp/audiolad-studio-dup-asset-diag.XXXXXX.js)"
  cat >"${probe}" <<'JS'
const silent = { info() {}, error() {} };
const dir = process.argv[2];
const brokenProjectId = process.argv[3];
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(dir, false, silent, true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("supabase_url_host=" + supabaseUrlHost(url));
  console.log("DIAG_PROBE=UNAVAILABLE reason=missing_env");
  printFlags({
    brokenProjectId,
    assetRowCount: "",
    uploadStateCounts: "",
    sourceIdNeIdCount: "",
    allReserved: "",
    sourceObjectsIntact: "",
    originalProjectId: "",
    originalRefsReady: "",
  });
  process.exit(2);
}

const { createClient } = require("@supabase/supabase-js");
const service = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PARENT_KEYS = [
  "duplicated_from",
  "parent",
  "parent_id",
  "parent_project_id",
  "source_project_id",
];
const COPY_NAME_RE = /^(.*) — копия(?: \d+)?$/;
const ASSET_BUCKET = "studio-draft-assets";

const timer = setTimeout(() => {
  console.log("DIAG_PROBE=UNAVAILABLE reason=timeout");
  process.exit(2);
}, 25000);

function printFlags(flags) {
  console.log("BROKEN_PROJECT_ID=" + (flags.brokenProjectId || ""));
  console.log("ASSET_ROW_COUNT=" + flags.assetRowCount);
  console.log("UPLOAD_STATE_COUNTS=" + flags.uploadStateCounts);
  console.log("SOURCE_ID_NE_ID_COUNT=" + flags.sourceIdNeIdCount);
  console.log("ALL_RESERVED=" + flags.allReserved);
  console.log("SOURCE_OBJECTS_INTACT=" + flags.sourceObjectsIntact);
  console.log("ORIGINAL_PROJECT_ID=" + (flags.originalProjectId || ""));
  console.log("ORIGINAL_REFS_READY=" + flags.originalRefsReady);
}

function supabaseUrlHost(raw) {
  const text = String(raw || "");
  try {
    return new URL(text).host || "";
  } catch {
    return text.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0];
  }
}

function errorText(err) {
  if (!err) return "none";
  const msg = err.message || err.details || err.code || String(err);
  return field(msg);
}

function asRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

async function queryRows(builder) {
  try {
    const result = unwrap(await builder);
    return { rows: asRows(result.data), error: result.error || null };
  } catch (err) {
    return { rows: [], error: err };
  }
}

function field(value) {
  if (value == null || value === "") return "";
  return String(value).replace(/\s+/g, " ").slice(0, 240);
}

function deletedLabel(value) {
  return value ? "set" : "null";
}

function boolLabel(value) {
  return value ? "true" : "false";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function unwrap(result) {
  if (!result) return { data: null, error: { message: "empty_result" } };
  return result;
}

async function storageObjectExists(storagePath) {
  if (!storagePath || typeof storagePath !== "string") return false;
  const slash = storagePath.lastIndexOf("/");
  if (slash <= 0) return false;
  const directory = storagePath.slice(0, slash);
  const filename = storagePath.slice(slash + 1);
  const bucket = service.storage.from(ASSET_BUCKET);
  if (typeof bucket.info === "function") {
    try {
      const info = await bucket.info(storagePath);
      if (info && !info.error && info.data) return true;
    } catch {
      // fall through to list
    }
  }
  try {
    const listed = await bucket.list(directory, { limit: 20, search: filename });
    if (listed && !listed.error && Array.isArray(listed.data)) {
      return listed.data.some((entry) => entry && entry.name === filename);
    }
  } catch {
    return false;
  }
  return false;
}

function copyBaseName(name) {
  const match = String(name || "").match(COPY_NAME_RE);
  return match ? match[1] : "";
}

function scoreOriginalCandidate(project, broken, sourceIds, otherAssets) {
  let score = 0;
  const refs = otherAssets.filter((row) => row.project_id === project.id);
  const readyRefs = refs.filter((row) => row.upload_state === "ready" && !row.deleted_at);
  const identityRefs = refs.filter((row) => row.id && row.id === row.source_id);
  if (identityRefs.length > 0) score += 8;
  if (readyRefs.length > 0) score += 4;
  if (refs.length >= sourceIds.length) score += 3;
  if (project.created_at && broken.created_at && project.created_at < broken.created_at) {
    score += 2;
  }
  const base = copyBaseName(broken.name);
  if (base && project.name === base) score += 5;
  if (project.status === "active") score += 1;
  return score;
}

Promise.resolve()
  .then(async () => {
    console.log("supabase_url_host=" + supabaseUrlHost(url));

    const projectLookup = await queryRows(
      service
        .from("studio_projects")
        .select("id,name,status,deleted_at,created_at,author_id,guest_session_id")
        .eq("id", brokenProjectId),
    );
    console.log("project_query_error=" + errorText(projectLookup.error));
    const project = projectLookup.rows[0] || null;
    if (projectLookup.error && !project) {
      console.log("project_found=ERROR");
    } else {
      console.log("project_found=" + (project ? "YES" : "NO"));
    }
    if (!project) {
      const prefix = String(brokenProjectId || "").slice(0, 8);
      const prefixLookup = await queryRows(
        service.from("studio_projects").select("id,deleted_at,status").ilike("id", prefix + "%"),
      );
      console.log("project_prefix=" + prefix);
      console.log("project_prefix_query_error=" + errorText(prefixLookup.error));
      console.log("PROJECT_ID_PREFIX_CANDIDATES=" + prefixLookup.rows.length);
      for (const row of prefixLookup.rows) {
        console.log(
          "PROJECT_CANDIDATE id=" +
            field(row.id) +
            " status=" +
            field(row.status) +
            " deleted_at=" +
            deletedLabel(row.deleted_at),
        );
      }
    }

    const presentParentKeys = project
      ? PARENT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(project, key))
      : [];
    if (project) {
      console.log(
        "schema_parent_keys=" + (presentParentKeys.length ? presentParentKeys.join(",") : "none"),
      );
      console.log(
        "project_name=" +
          field(project.name) +
          " status=" +
          field(project.status) +
          " deleted_at=" +
          deletedLabel(project.deleted_at),
      );
    } else {
      console.log("schema_parent_keys=skipped");
    }
    if (project) {
      const starLookup = await queryRows(
        service.from("studio_projects").select("*").eq("id", brokenProjectId),
      );
      console.log("project_star_query_error=" + errorText(starLookup.error));
      if (!starLookup.error && starLookup.rows[0]) {
        Object.assign(project, starLookup.rows[0]);
      }
      const presentAfterStar = PARENT_KEYS.filter((key) =>
        Object.prototype.hasOwnProperty.call(project, key),
      );
      if (presentAfterStar.length) {
        console.log("schema_parent_keys=" + presentAfterStar.join(","));
      }
    }

    const assetLookup = await queryRows(
      service
        .from("studio_project_assets")
        .select(
          "id,source_id,original_name,upload_state,deleted_at,storage_path,created_at,project_id",
        )
        .eq("project_id", brokenProjectId),
    );
    console.log("asset_query_error=" + errorText(assetLookup.error));
    const assets = assetLookup.rows;
    const sourceIds = [...new Set(assets.map((row) => row.source_id).filter(Boolean))];

    let sources = [];
    if (sourceIds.length > 0) {
      const sourceResult = unwrap(
        await service
          .from("studio_asset_sources")
          .select("id,storage_path,deleted_at")
          .in("id", sourceIds),
      );
      console.log("source_query_error=" + errorText(sourceResult.error));
      if (!sourceResult.error && Array.isArray(sourceResult.data)) {
        sources = sourceResult.data;
      }
    } else {
      console.log("source_query_error=none");
    }
    const sourceById = new Map(sources.map((row) => [row.id, row]));

    const counts = {};
    let sourceIdNeIdCount = 0;
    let allReserved = assets.length > 0;
    let sourceObjectsIntact = assets.length > 0;
    for (const asset of assets) {
      const source = sourceById.get(asset.source_id) || null;
      const sourceExists = Boolean(source);
      const objectPath = (source && source.storage_path) || asset.storage_path || "";
      const objectExists = await storageObjectExists(objectPath);
      const state = asset.upload_state || "";
      counts[state] = (counts[state] || 0) + 1;
      if (asset.source_id && asset.id && asset.source_id !== asset.id) sourceIdNeIdCount += 1;
      if (state !== "reserved") allReserved = false;
      if (!objectExists) sourceObjectsIntact = false;
      console.log(
        [
          "ASSET",
          "id=" + field(asset.id),
          "source_id=" + field(asset.source_id),
          "original_name=" + field(asset.original_name),
          "upload_state=" + field(state),
          "deleted_at=" + deletedLabel(asset.deleted_at),
          "source_exists=" + boolLabel(sourceExists),
          "source_deleted_at=" + deletedLabel(source && source.deleted_at),
          "storage_object_exists=" + boolLabel(objectExists),
        ].join(" "),
      );
    }

    const uploadStateCounts = Object.keys(counts)
      .sort()
      .map((state) => state + ":" + counts[state])
      .join(",");

    let otherAssets = [];
    if (sourceIds.length > 0) {
      const otherResult = unwrap(
        await service
          .from("studio_project_assets")
          .select("id,project_id,source_id,upload_state,deleted_at,created_at")
          .in("source_id", sourceIds),
      );
      if (!otherResult.error && Array.isArray(otherResult.data)) {
        otherAssets = otherResult.data.filter((row) => row.project_id !== brokenProjectId);
      }
    }

    let originalProjectId = "";
    let originalVia = "none";
    for (const key of presentParentKeys) {
      if (isUuid(project[key])) {
        originalProjectId = project[key];
        originalVia = "column:" + key;
        break;
      }
    }

    const baseName = copyBaseName(project && project.name);
    let nameMatchId = "";
    if (baseName) {
      const nameResult = unwrap(
        await service.from("studio_projects").select("id,name,status,created_at,deleted_at,author_id,guest_session_id").eq("name", baseName),
      );
      if (!nameResult.error && Array.isArray(nameResult.data)) {
        const matches = nameResult.data.filter((row) => {
          if (row.id === brokenProjectId) return false;
          if (project && project.author_id && row.author_id && row.author_id !== project.author_id) return false;
          if (project && project.guest_session_id && row.guest_session_id && row.guest_session_id !== project.guest_session_id) {
            return false;
          }
          return true;
        });
        matches.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
        if (matches[0]) nameMatchId = matches[0].id;
      }
    }

    const candidateIds = [...new Set(otherAssets.map((row) => row.project_id).filter(Boolean))];
    let sourceMatchId = "";
    if (candidateIds.length > 0) {
      const candResult = unwrap(
        await service
          .from("studio_projects")
          .select("id,name,status,created_at,deleted_at,author_id,guest_session_id")
          .in("id", candidateIds),
      );
      if (!candResult.error && Array.isArray(candResult.data)) {
        const ranked = candResult.data
          .map((row) => ({
            row,
            score: scoreOriginalCandidate(row, project || { id: brokenProjectId }, sourceIds, otherAssets),
          }))
          .sort((a, b) => b.score - a.score || String(a.row.created_at || "").localeCompare(String(b.row.created_at || "")));
        if (ranked[0] && ranked[0].score > 0) sourceMatchId = ranked[0].row.id;
      }
    }

    if (!originalProjectId) {
      if (sourceMatchId && nameMatchId && sourceMatchId === nameMatchId) {
        originalProjectId = sourceMatchId;
        originalVia = "name_heuristic+matching_sources";
      } else if (sourceMatchId) {
        originalProjectId = sourceMatchId;
        originalVia = "matching_sources";
      } else if (nameMatchId) {
        originalProjectId = nameMatchId;
        originalVia = "name_heuristic";
      }
    }
    console.log("ORIGINAL_PROJECT_VIA=" + originalVia);
    if (nameMatchId) console.log("name_heuristic_id=" + nameMatchId);
    if (sourceMatchId) console.log("matching_sources_id=" + sourceMatchId);

    let originalRefsReady = "NO";
    if (originalProjectId && sourceIds.length > 0) {
      const originalRefs = otherAssets.filter((row) => row.project_id === originalProjectId);
      const bySource = new Map();
      for (const ref of originalRefs) {
        console.log(
          [
            "ORIGINAL_REF",
            "source_id=" + field(ref.source_id),
            "id=" + field(ref.id),
            "upload_state=" + field(ref.upload_state),
            "deleted_at=" + deletedLabel(ref.deleted_at),
          ].join(" "),
        );
        if (!bySource.has(ref.source_id)) bySource.set(ref.source_id, []);
        bySource.get(ref.source_id).push(ref);
      }
      originalRefsReady =
        sourceIds.every((sourceId) => {
          const refs = bySource.get(sourceId) || [];
          return refs.some((ref) => ref.upload_state === "ready" && !ref.deleted_at);
        })
          ? "YES"
          : "NO";
    } else if (originalProjectId && sourceIds.length === 0) {
      originalRefsReady = "YES";
    }

    printFlags({
      brokenProjectId,
      assetRowCount: assets.length,
      uploadStateCounts,
      sourceIdNeIdCount,
      allReserved: allReserved ? "YES" : "NO",
      sourceObjectsIntact: sourceObjectsIntact ? "YES" : "NO",
      originalProjectId,
      originalRefsReady,
    });
    console.log("DIAG_PROBE=OK");
    clearTimeout(timer);
  })
  .catch((err) => {
    clearTimeout(timer);
    console.log("DIAG_PROBE=UNAVAILABLE reason=error");
    console.log("probe_error=" + errorText(err));
    printFlags({
      brokenProjectId,
      assetRowCount: "",
      uploadStateCounts: "",
      sourceIdNeIdCount: "",
      allReserved: "",
      sourceObjectsIntact: "",
      originalProjectId: "",
      originalRefsReady: "",
    });
    process.exit(2);
  });
JS
  set +e
  output="$(
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    export NODE_ENV=production
    export NODE_PATH="${dir}/node_modules${NODE_PATH:+:${NODE_PATH}}"
    cd "${dir}"
    node "${probe}" "${dir}" "${BROKEN_PROJECT_ID}" 2>/dev/null
  )"
  code=$?
  set -e
  rm -f "${probe}"
  output="$(printf '%s\n' "${output}" | redact_studio_stream)"
  if [[ -n "${output}" ]]; then
    printf '%s\n' "${output}"
  fi
  if [[ "${code}" -ne 0 && "${output}" != *DIAG_PROBE=OK* ]]; then
    return 1
  fi
  return 0
}

run_studio_duplicate_asset_diag() {
  local current_real=""
  section "STUDIO_DUPLICATE_ASSET_DIAG"
  echo "mode=read_only_duplicate_asset_diag"
  echo "confirm=OPS_STUDIO_DUPLICATE_ASSET_DIAG"
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
  echo "shared_env_path=${SHARED_ENV_PRODUCTION} exists=$([[ -e "${SHARED_ENV_PRODUCTION}" ]] && echo YES || echo NO)"
  echo "note=shared_env_production_loaded_via_current_loadEnvConfig"
  echo "note=no_signed_urls_no_keys_no_storage_urls"
  echo "loadEnvConfig=service_role_read_only"
  echo "BROKEN_PROJECT_ID=${BROKEN_PROJECT_ID}"

  section "DUPLICATE ASSET ROWS"
  echo "mode=read_only"
  if ! run_duplicate_asset_diag_node; then
    echo "diag_probe=unavailable"
  fi

  section "STUDIO_DUPLICATE_ASSET_DIAG_END"
  echo "CUTOVER = NO"
  echo "audiolad_deploy = NOT_INVOKED"
  echo "MODE = read_only_duplicate_asset_diag"
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_studio_duplicate_asset_diag
fi
