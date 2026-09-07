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
