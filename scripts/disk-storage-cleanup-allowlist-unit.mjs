#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWLIST_ASSETS,
  ALLOWLIST_ASSET_IDS,
  ALLOWLIST_ORIGINAL_NAMES,
  ALLOWLIST_RELEASE_BASENAMES,
  AUDIT_RUN_ID,
  CLEANUP_BUCKET,
  CLEANUP_PROJECT_ID,
  REDACTED_ASSET_ID_PREFIX,
  REDACTED_ASSET_ORIGINAL_NAME,
  evaluateAssetDelete,
  evaluateClipCascade,
  evaluateProjectDelete,
  evaluateReleaseDelete,
  evaluateRenderJobDelete,
  evaluateStorageDelete,
  expectedOriginalNameForAssetId,
  isAllowlistedAssetId,
  isAllowlistedOriginalName,
  isAllowlistedReleaseBasename,
  isProvenTestBlob,
  isRedactedAssetIdPrefix,
  resolveRedactedAsset,
} from "../deploy/scripts/lib/disk-storage-cleanup-allowlist.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = join(repoRoot, "deploy/scripts/audiolad-disk-storage-cleanup.sh");
const workflowPath = join(repoRoot, ".github/workflows/production-deploy.yml");

function main() {
  assert.equal(AUDIT_RUN_ID, "34113627251");
  assert.equal(CLEANUP_PROJECT_ID, "6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4");
  assert.equal(CLEANUP_BUCKET, "studio-draft-assets");
  assert.deepEqual(ALLOWLIST_RELEASE_BASENAMES, [
    "20260906-113101-2acc27e1",
    "20260907-064414-b85c870a",
  ]);
  assert.equal(ALLOWLIST_ASSETS.length, 10);
  assert.equal(ALLOWLIST_ASSET_IDS.length, 10);
  assert.equal(REDACTED_ASSET_ID_PREFIX, "4fc1d620-aaff-44fe-9893-8ca27e29");
  assert.equal(REDACTED_ASSET_ORIGINAL_NAME, "synth_over3h.mp3");
  assert.ok(ALLOWLIST_ORIGINAL_NAMES.includes("real_75min.mp3"));
  assert.ok(ALLOWLIST_ORIGINAL_NAMES.includes("quota-a.mp3"));
  assert.ok(ALLOWLIST_ORIGINAL_NAMES.includes("quota_probe_314572799.mp3"));
  assert.equal(
    expectedOriginalNameForAssetId("800870b6-59cc-4f71-9df7-e30260723f83"),
    "real_75min.mp3",
  );
  assert.equal(expectedOriginalNameForAssetId("4fc1d620-aaff-44fe-9893-8ca27e29aa33"), "");
  assert.ok(isAllowlistedReleaseBasename("20260906-113101-2acc27e1"));
  assert.equal(isAllowlistedReleaseBasename("20260907-100034-fbda1c14"), false);
  assert.ok(isAllowlistedAssetId("8f2d8683-138b-41c1-9db4-f3e85e679484"));
  assert.equal(isAllowlistedAssetId("00000000-0000-0000-0000-000000000000"), false);
  assert.ok(isAllowlistedOriginalName("synth_over3h.mp3"));
  assert.equal(isAllowlistedOriginalName("meditation.mp3"), false);
  assert.ok(isRedactedAssetIdPrefix("4fc1d620-aaff-44fe-9893-8ca27e29aa33"));
  assert.equal(isRedactedAssetIdPrefix("85a0809e-c82d-43bf-a629-a1cfdd67ca8b"), false);

  assert.equal(isProvenTestBlob(["studio/x/6aa9fd82-7bb6-4df6-8761-6c2f8a1337b4/a.mp3"]), true);
  assert.equal(isProvenTestBlob(["synth_3h.mp3"]), true);
  assert.equal(isProvenTestBlob(["real_75min.mp3"]), true);
  assert.equal(isProvenTestBlob(["quota-a.mp3"]), false);
  assert.equal(isProvenTestBlob(["user-voiceover.mp3"]), false);

  const releasesDir = "/var/www/audiolad-deploy/releases";
  assert.deepEqual(
    evaluateReleaseDelete({
      basename: "20260906-113101-2acc27e1",
      currentBasename: "20260907-100034-fbda1c14",
      previousBasename: "20260907-101535-d9f9cf2e",
      absolutePath: `${releasesDir}/20260906-113101-2acc27e1`,
      releasesDir,
    }),
    { ok: true, reason: "allowlisted_release" },
  );
  assert.equal(
    evaluateReleaseDelete({
      basename: "20260907-100034-fbda1c14",
      currentBasename: "20260907-100034-fbda1c14",
      previousBasename: "20260907-101535-d9f9cf2e",
      absolutePath: `${releasesDir}/20260907-100034-fbda1c14`,
      releasesDir,
    }).ok,
    false,
  );
  assert.equal(
    evaluateReleaseDelete({
      basename: "20260906-113101-2acc27e1",
      currentBasename: "20260906-113101-2acc27e1",
      previousBasename: "20260907-101535-d9f9cf2e",
      absolutePath: `${releasesDir}/20260906-113101-2acc27e1`,
      releasesDir,
    }).reason,
    "current_is_allowlisted",
  );
  assert.equal(
    evaluateReleaseDelete({
      basename: "20260906-113101-2acc27e1",
      currentBasename: "20260907-100034-fbda1c14",
      previousBasename: "20260907-064414-b85c870a",
      absolutePath: `${releasesDir}/20260906-113101-2acc27e1`,
      releasesDir,
    }).reason,
    "previous_is_allowlisted",
  );
  assert.equal(
    evaluateReleaseDelete({
      basename: "20260906-113101-2acc27e1",
      currentBasename: "",
      previousBasename: "prev",
      absolutePath: `${releasesDir}/20260906-113101-2acc27e1`,
      releasesDir,
    }).reason,
    "current_unreadable",
  );
  assert.equal(
    evaluateReleaseDelete({
      basename: "20260906-113101-2acc27e1",
      currentBasename: "cur",
      previousBasename: "prev",
      absolutePath: `/tmp/20260906-113101-2acc27e1`,
      releasesDir,
    }).reason,
    "path_not_under_releases",
  );
  assert.equal(
    evaluateReleaseDelete({
      basename: "20260906-113101-2acc27e1",
      currentBasename: "cur",
      previousBasename: "prev",
      absolutePath: `${releasesDir}/other`,
      releasesDir,
    }).reason,
    "path_basename_mismatch",
  );

  const guestProject = {
    id: CLEANUP_PROJECT_ID,
    author_id: null,
    name: "",
  };
  const goodAsset = {
    id: "800870b6-59cc-4f71-9df7-e30260723f83",
    project_id: CLEANUP_PROJECT_ID,
    original_name: "real_75min.mp3",
    storage_path: `studio/guest/${CLEANUP_PROJECT_ID}/800870b6-59cc-4f71-9df7-e30260723f83/real_75min.mp3`,
  };
  assert.deepEqual(evaluateAssetDelete({ asset: goodAsset, project: guestProject }), {
    ok: true,
    reason: "allowlisted_asset",
  });
  assert.equal(
    evaluateAssetDelete({
      asset: { ...goodAsset, project_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
      project: guestProject,
    }).reason,
    "project_id_mismatch",
  );
  assert.equal(
    evaluateAssetDelete({
      asset: { ...goodAsset, original_name: "synth_3h.mp3" },
      project: guestProject,
    }).reason,
    "original_name_mismatch_for_id",
  );
  assert.equal(
    evaluateAssetDelete({
      asset: { ...goodAsset, storage_path: "studio/other/file.mp3" },
      project: guestProject,
    }).reason,
    "storage_path_missing_ids",
  );
  assert.equal(
    evaluateAssetDelete({
      asset: goodAsset,
      project: { ...guestProject, author_id: "real-author" },
    }).reason,
    "has_real_user_author",
  );
  assert.equal(
    evaluateAssetDelete({
      asset: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        project_id: CLEANUP_PROJECT_ID,
        original_name: "real_75min.mp3",
        storage_path: `studio/${CLEANUP_PROJECT_ID}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/real_75min.mp3`,
      },
      project: guestProject,
    }).reason,
    "id_not_allowlisted",
  );

  const redactedRow = {
    id: "4fc1d620-aaff-44fe-9893-8ca27e29aa33",
    project_id: CLEANUP_PROJECT_ID,
    original_name: "synth_over3h.mp3",
    storage_path: `studio/x/${CLEANUP_PROJECT_ID}/4fc1d620-aaff-44fe-9893-8ca27e29aa33/synth_over3h.mp3`,
  };
  assert.equal(resolveRedactedAsset([redactedRow]).ok, true);
  assert.equal(resolveRedactedAsset([]).reason, "redacted_not_found");
  assert.equal(
    resolveRedactedAsset([
      redactedRow,
      { ...redactedRow, id: "4fc1d620-aaff-44fe-9893-8ca27e29bb33" },
    ]).reason,
    "redacted_not_unique",
  );
  assert.equal(
    resolveRedactedAsset([
      { ...redactedRow, original_name: "other.mp3" },
    ]).reason,
    "redacted_not_found",
  );
  assert.equal(
    evaluateAssetDelete({ asset: redactedRow, project: guestProject }).ok,
    true,
  );

  assert.equal(
    evaluateStorageDelete({
      storagePath: goodAsset.storage_path,
      sourceId: goodAsset.id,
      otherAssets: [goodAsset],
    }).ok,
    true,
  );
  assert.equal(
    evaluateStorageDelete({
      storagePath: goodAsset.storage_path,
      sourceId: "shared-source",
      otherAssets: [
        {
          id: "real-user-asset",
          source_id: "shared-source",
          storage_path: "studio/real/user.mp3",
        },
      ],
    }).reason,
    "shared_with_non_allowlisted_asset",
  );

  assert.equal(
    evaluateRenderJobDelete({
      job: {
        id: "job-1",
        project_id: CLEANUP_PROJECT_ID,
        status: "failed",
        output_storage_path: "",
      },
    }).ok,
    true,
  );
  assert.equal(
    evaluateRenderJobDelete({
      job: {
        id: "job-2",
        project_id: CLEANUP_PROJECT_ID,
        status: "processing",
        output_storage_path: "",
      },
    }).reason,
    "job_processing",
  );
  assert.equal(
    evaluateRenderJobDelete({
      job: {
        id: "job-3",
        project_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        status: "failed",
        output_storage_path: "",
      },
    }).reason,
    "job_other_project",
  );
  assert.equal(
    evaluateRenderJobDelete({
      job: {
        id: "job-4",
        project_id: CLEANUP_PROJECT_ID,
        status: "completed",
        output_storage_path: "studio-renders/real-user-mixdown.mp3",
      },
    }).reason,
    "job_output_not_proven",
  );

  assert.equal(
    evaluateProjectDelete({ project: guestProject, remainingAssetCount: 0 }).ok,
    true,
  );
  assert.equal(
    evaluateProjectDelete({ project: guestProject, remainingAssetCount: 1 }).reason,
    "assets_remain",
  );
  assert.equal(
    evaluateProjectDelete({
      project: { ...guestProject, author_id: "author" },
      remainingAssetCount: 0,
    }).reason,
    "has_author",
  );
  assert.equal(
    evaluateProjectDelete({
      project: { ...guestProject, name: "Client session" },
      remainingAssetCount: 0,
    }).reason,
    "name_not_acceptance",
  );

  assert.equal(evaluateClipCascade({ clipRefs: [], allowlistedIds: ALLOWLIST_ASSET_IDS }).reason, "no_clip_table_skip_cascade");
  assert.equal(
    evaluateClipCascade({
      clipRefs: [{ asset_id: ALLOWLIST_ASSET_IDS[0] }],
      allowlistedIds: ALLOWLIST_ASSET_IDS,
    }).ok,
    true,
  );
  assert.equal(
    evaluateClipCascade({
      clipRefs: [{ asset_id: "real-user-clip-asset" }],
      allowlistedIds: ALLOWLIST_ASSET_IDS,
    }).reason,
    "clip_refs_foreign_assets",
  );

  const helperText = readFileSync(helperPath, "utf8");
  const workflowText = readFileSync(workflowPath, "utf8");
  for (const needle of [
    "OPS_DISK_STORAGE_CLEANUP",
    CLEANUP_PROJECT_ID,
    REDACTED_ASSET_ID_PREFIX,
    ...ALLOWLIST_RELEASE_BASENAMES,
    ...ALLOWLIST_ASSET_IDS,
    ...ALLOWLIST_ORIGINAL_NAMES,
    "MODE = allowlist_cleanup",
    "CUTOVER = NO",
    "CLEANUP =",
  ]) {
    assert.match(
      helperText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `helper must contain ${needle}`,
    );
    assert.match(
      workflowText,
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `workflow must contain ${needle}`,
    );
  }

  console.log("disk-storage-cleanup-allowlist-unit: all tests passed");
}

main();
