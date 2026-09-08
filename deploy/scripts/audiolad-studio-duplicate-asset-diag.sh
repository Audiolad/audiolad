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
  printScanFlags(emptyScanFlags());
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
const PRAYER_NAME_RE = /молитва\s+от\s+уныния/i;
const ASSET_BUCKET = "studio-draft-assets";
const AUDIT_TABLE = "author_support_audit_events";
const TARGET_UUID = String(brokenProjectId || "").toLowerCase();
const PAGE_SIZE = 200;
const MAX_SCAN_ROWS = 2000;
const seenProjectOrAssetIds = new Set();
const objectExistsCache = new Map();

const timer = setTimeout(() => {
  console.log("DIAG_PROBE=UNAVAILABLE reason=timeout");
  process.exit(2);
}, 90000);

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

function emptyScanFlags() {
  return {
    brokenSharedRefsCount: "",
    brokenProjectIds: "",
    targetFound: "",
    sourceObjectsIntact: "",
    auditProjectId: "",
    auditSourceProjectId: "",
  };
}

function printScanFlags(flags) {
  console.log("BROKEN_SHARED_REFS_COUNT=" + flags.brokenSharedRefsCount);
  console.log("BROKEN_PROJECT_IDS=" + (flags.brokenProjectIds || ""));
  console.log("3832DED1_FOUND=" + flags.targetFound);
  console.log("SOURCE_OBJECTS_INTACT=" + flags.sourceObjectsIntact);
  console.log("DUPLICATION_AUDIT_PROJECT_ID=" + (flags.auditProjectId || ""));
  console.log("DUPLICATION_AUDIT_SOURCE_PROJECT_ID=" + (flags.auditSourceProjectId || ""));
}

function noteProjectOrAssetId(id) {
  const value = String(id || "").toLowerCase();
  if (value) seenProjectOrAssetIds.add(value);
}

function targetFoundLabel() {
  return seenProjectOrAssetIds.has(TARGET_UUID) ? "YES" : "NO";
}

function yesNo(value) {
  return value ? "YES" : "NO";
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

async function cachedStorageObjectExists(storagePath) {
  const key = String(storagePath || "");
  if (objectExistsCache.has(key)) return objectExistsCache.get(key);
  const exists = await storageObjectExists(key);
  objectExistsCache.set(key, exists);
  return exists;
}

async function fetchByIds(table, columns, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const lookup = await queryRows(
      service.from(table).select(columns).in("id", chunk),
    );
    if (lookup.error) return { rows: out, error: lookup.error };
    out.push(...lookup.rows);
  }
  return { rows: out, error: null };
}

function metadataObject(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? raw : {};
}

function metadataSourceProjectId(meta) {
  const obj = metadataObject(meta);
  for (const key of [
    "source_project_id",
    "sourceProjectId",
    "parent_project_id",
    "parentProjectId",
  ]) {
    if (isUuid(obj[key])) return obj[key];
  }
  return "";
}

function metadataNameFields(meta) {
  const obj = metadataObject(meta);
  return Object.keys(obj)
    .filter((key) => /name/i.test(key) && obj[key] != null && obj[key] !== "")
    .map((key) => key + "=" + field(obj[key]))
    .join(" ");
}

function collectTrackAssetIds(projectData) {
  let data = projectData;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const tracks = data && Array.isArray(data.tracks) ? data.tracks : [];
  return tracks.map((track) => track && track.assetId).filter(Boolean);
}

function isPrayerCopyName(name) {
  return PRAYER_NAME_RE.test(String(name || ""));
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
    console.log("===== SINGLE PROJECT PROBE =====");

    const projectLookup = await queryRows(
      service
        .from("studio_projects")
        .select("id,name,status,deleted_at,created_at,author_id,guest_session_id")
        .eq("id", brokenProjectId),
    );
    console.log("project_query_error=" + errorText(projectLookup.error));
    const project = projectLookup.rows[0] || null;
    if (project) noteProjectOrAssetId(project.id);
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
        noteProjectOrAssetId(row.id);
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
    for (const asset of assets) {
      noteProjectOrAssetId(asset.id);
      noteProjectOrAssetId(asset.project_id);
    }
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
      const objectExists = await cachedStorageObjectExists(objectPath);
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

    console.log("===== GLOBAL BROKEN SHARED REFS =====");
    const reservedLookup = { rows: [], error: null };
    for (let from = 0; from < MAX_SCAN_ROWS; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, MAX_SCAN_ROWS - 1);
      const page = await queryRows(
        service
          .from("studio_project_assets")
          .select(
            "id,project_id,source_id,original_name,upload_state,deleted_at,storage_path,created_at",
          )
          .eq("upload_state", "reserved")
          .is("deleted_at", null)
          .not("source_id", "is", null)
          .order("created_at", { ascending: false })
          .range(from, to),
      );
      if (page.error) {
        reservedLookup.error = page.error;
        break;
      }
      reservedLookup.rows.push(...page.rows);
      if (page.rows.length < PAGE_SIZE) break;
    }
    console.log("broken_shared_refs_query_error=" + errorText(reservedLookup.error));
    const brokenRefs = reservedLookup.rows.filter(
      (row) => row.source_id && row.id && row.source_id !== row.id,
    );
    for (const row of brokenRefs) {
      noteProjectOrAssetId(row.id);
      noteProjectOrAssetId(row.project_id);
    }
    const brokenProjectIds = [
      ...new Set(brokenRefs.map((row) => row.project_id).filter(Boolean)),
    ].sort();
    const brokenProjectsLookup = await fetchByIds(
      "studio_projects",
      "id,name,created_at,status,deleted_at",
      brokenProjectIds,
    );
    console.log("broken_projects_query_error=" + errorText(brokenProjectsLookup.error));
    const brokenProjectById = new Map(
      brokenProjectsLookup.rows.map((row) => [row.id, row]),
    );
    for (const row of brokenProjectsLookup.rows) noteProjectOrAssetId(row.id);

    const brokenSourceIds = [
      ...new Set(brokenRefs.map((row) => row.source_id).filter(Boolean)),
    ];
    const brokenSourcesLookup = await fetchByIds(
      "studio_asset_sources",
      "id,storage_path,deleted_at",
      brokenSourceIds,
    );
    console.log("broken_sources_query_error=" + errorText(brokenSourcesLookup.error));
    const brokenSourceById = new Map(
      brokenSourcesLookup.rows.map((row) => [row.id, row]),
    );

    let globalSourceObjectsIntact = brokenRefs.length === 0;
    if (brokenRefs.length > 0) globalSourceObjectsIntact = true;
    for (const row of brokenRefs) {
      const projectRow = brokenProjectById.get(row.project_id) || null;
      const source = brokenSourceById.get(row.source_id) || null;
      const sourceLive = Boolean(source && !source.deleted_at);
      const objectPath = (source && source.storage_path) || row.storage_path || "";
      const objectExists = await cachedStorageObjectExists(objectPath);
      if (!sourceLive || !objectExists) globalSourceObjectsIntact = false;
      console.log(
        [
          "BROKEN_REF",
          "project_id=" + field(row.project_id),
          "project_name=" + field(projectRow && projectRow.name),
          "project_created_at=" + field(projectRow && projectRow.created_at),
          "asset_id=" + field(row.id),
          "source_id=" + field(row.source_id),
          "original_name=" + field(row.original_name),
          "source_live=" + yesNo(sourceLive),
          "storage_object=" + yesNo(objectExists),
        ].join(" "),
      );
    }

    console.log("===== DUPLICATION AUDIT =====");
    console.log("AUDIT_TABLE=" + AUDIT_TABLE);
    console.log("AUDIT_ACTION=studio_project_duplicated");
    console.log("AUDIT_NOTE=author_support_audit_events_records_support_mode_only");
    const auditLookup = await queryRows(
      service
        .from(AUDIT_TABLE)
        .select("id,created_at,action,resource_type,resource_id,metadata")
        .eq("action", "studio_project_duplicated")
        .order("created_at", { ascending: false })
        .limit(50),
    );
    console.log("audit_query_error=" + errorText(auditLookup.error));
    const auditRows = auditLookup.rows;
    console.log("AUDIT_ROW_COUNT=" + auditRows.length);
    const auditProjectIds = [
      ...new Set(auditRows.map((row) => row.resource_id).filter(Boolean)),
    ];
    const auditProjectsLookup = await fetchByIds(
      "studio_projects",
      "id,name,created_at,status,deleted_at",
      auditProjectIds,
    );
    const auditProjectById = new Map(
      auditProjectsLookup.rows.map((row) => [row.id, row]),
    );
    for (const row of auditProjectsLookup.rows) noteProjectOrAssetId(row.id);

    const prayerNameLookup = await queryRows(
      service
        .from("studio_projects")
        .select("id,name,created_at,status,deleted_at")
        .ilike("name", "%Молитва от уныния%"),
    );
    console.log("prayer_name_query_error=" + errorText(prayerNameLookup.error));
    console.log("PRAYER_NAME_MATCH_COUNT=" + prayerNameLookup.rows.length);
    for (const row of prayerNameLookup.rows) {
      noteProjectOrAssetId(row.id);
      console.log(
        [
          "NAME_MATCH",
          "id=" + field(row.id),
          "name=" + field(row.name),
          "created_at=" + field(row.created_at),
          "status=" + field(row.status),
          "deleted_at=" + deletedLabel(row.deleted_at),
        ].join(" "),
      );
    }

    let preferredAudit = null;
    for (const row of auditRows) {
      const joined = auditProjectById.get(row.resource_id) || null;
      const meta = metadataObject(row.metadata);
      const sourceProjectId = metadataSourceProjectId(row.metadata);
      const nameFields = metadataNameFields(row.metadata);
      const joinedName = joined && joined.name ? joined.name : "";
      const metaName = meta.project_name || meta.name || "";
      const displayName = joinedName || metaName;
      console.log(
        [
          "AUDIT",
          "resource_id=" + field(row.resource_id),
          "source_project_id=" + field(sourceProjectId),
          "created_at=" + field(row.created_at),
          "name=" + field(displayName),
          nameFields,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!preferredAudit && isPrayerCopyName(displayName)) {
        preferredAudit = { row, sourceProjectId, displayName };
      }
    }
    if (!preferredAudit && auditRows[0]) {
      preferredAudit = {
        row: auditRows[0],
        sourceProjectId: metadataSourceProjectId(auditRows[0].metadata),
        displayName:
          ((auditProjectById.get(auditRows[0].resource_id) || {}).name) || "",
      };
    }
    if (!preferredAudit && prayerNameLookup.rows.length > 0) {
      const copyMatch =
        prayerNameLookup.rows.find((row) => COPY_NAME_RE.test(row.name || "")) ||
        prayerNameLookup.rows[0];
      const base = copyBaseName(copyMatch.name);
      const sourceMatch = prayerNameLookup.rows.find((row) => row.name === base);
      preferredAudit = {
        row: { resource_id: copyMatch.id, created_at: copyMatch.created_at },
        sourceProjectId: sourceMatch ? sourceMatch.id : "",
        displayName: copyMatch.name,
        via: "name_search",
      };
    }
    const auditProjectId =
      preferredAudit && preferredAudit.row && preferredAudit.row.resource_id
        ? preferredAudit.row.resource_id
        : "";
    const auditSourceProjectId =
      (preferredAudit && preferredAudit.sourceProjectId) || "";
    if (preferredAudit && preferredAudit.via === "name_search") {
      console.log("DUPLICATION_AUDIT_VIA=name_search");
    } else if (preferredAudit) {
      console.log("DUPLICATION_AUDIT_VIA=author_support_audit_events");
    } else {
      console.log("DUPLICATION_AUDIT_VIA=none");
    }

    console.log("===== SOURCE PROJECT CHECK =====");
    const inferredSourceIds = [
      ...new Set(
        [auditSourceProjectId, originalProjectId].filter((id) => isUuid(id)),
      ),
    ];
    if (inferredSourceIds.length === 0 && brokenSourceIds.length > 0) {
      const owners = await queryRows(
        service
          .from("studio_project_assets")
          .select("id,project_id,source_id,upload_state,deleted_at")
          .in("source_id", brokenSourceIds.slice(0, 100)),
      );
      const ownerProjectIds = [
        ...new Set(
          owners.rows
            .filter((row) => row.id && row.id === row.source_id && !row.deleted_at)
            .map((row) => row.project_id)
            .filter(Boolean),
        ),
      ];
      inferredSourceIds.push(...ownerProjectIds.slice(0, 3));
    }
    console.log("SOURCE_PROJECT_IDS=" + inferredSourceIds.join(","));
    const sourceProjectsLookup = await fetchByIds(
      "studio_projects",
      "id,name,created_at,status,deleted_at,project_data",
      inferredSourceIds,
    );
    console.log("source_project_query_error=" + errorText(sourceProjectsLookup.error));
    const sourceProjectById = new Map(
      sourceProjectsLookup.rows.map((row) => [row.id, row]),
    );
    for (const sourceId of inferredSourceIds) {
      const sourceProject = sourceProjectById.get(sourceId) || null;
      noteProjectOrAssetId(sourceId);
      const trackAssetIds = collectTrackAssetIds(
        sourceProject && sourceProject.project_data,
      );
      console.log(
        [
          "SOURCE_PROJECT",
          "id=" + field(sourceId),
          "name=" + field(sourceProject && sourceProject.name),
          "created_at=" + field(sourceProject && sourceProject.created_at),
          "track_asset_count=" + trackAssetIds.length,
        ].join(" "),
      );
      if (trackAssetIds.length > 20) {
        console.log(
          "SOURCE_TRACK_ASSET_IDS=count:" +
            trackAssetIds.length +
            " first=" +
            trackAssetIds.slice(0, 8).join(","),
        );
      } else if (trackAssetIds.length > 0) {
        console.log("SOURCE_TRACK_ASSET_IDS=" + trackAssetIds.join(","));
      } else {
        console.log("SOURCE_TRACK_ASSET_IDS=");
      }
      const refLookup = await queryRows(
        service
          .from("studio_project_assets")
          .select("id,source_id,upload_state,deleted_at,storage_path,original_name")
          .eq("project_id", sourceId),
      );
      console.log(
        "source_refs_query_error=" +
          errorText(refLookup.error) +
          " count=" +
          refLookup.rows.length,
      );
      const refSourceIds = [
        ...new Set(refLookup.rows.map((row) => row.source_id).filter(Boolean)),
      ];
      const refSourcesLookup = await fetchByIds(
        "studio_asset_sources",
        "id,storage_path,deleted_at",
        refSourceIds,
      );
      const refSourceById = new Map(
        refSourcesLookup.rows.map((row) => [row.id, row]),
      );
      const refsToPrint =
        refLookup.rows.length > 40 ? refLookup.rows.slice(0, 40) : refLookup.rows;
      for (const ref of refsToPrint) {
        noteProjectOrAssetId(ref.id);
        const source = refSourceById.get(ref.source_id) || null;
        const objectPath = (source && source.storage_path) || ref.storage_path || "";
        const objectExists = await cachedStorageObjectExists(objectPath);
        console.log(
          [
            "SOURCE_REF",
            "id=" + field(ref.id),
            "upload_state=" + field(ref.upload_state),
            "source_id=" + field(ref.source_id),
            "deleted_at=" + deletedLabel(ref.deleted_at),
            "storage_object=" + yesNo(objectExists),
          ].join(" "),
        );
      }
      if (refLookup.rows.length > refsToPrint.length) {
        console.log("SOURCE_REF_OMITTED=" + (refLookup.rows.length - refsToPrint.length));
      }
    }

    printScanFlags({
      brokenSharedRefsCount: brokenRefs.length,
      brokenProjectIds: brokenProjectIds.join(","),
      targetFound: targetFoundLabel(),
      sourceObjectsIntact: globalSourceObjectsIntact ? "YES" : "NO",
      auditProjectId,
      auditSourceProjectId,
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
    printScanFlags(emptyScanFlags());
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
  echo "scan=single_project_probe+global_broken_shared_refs+duplication_audit"
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
