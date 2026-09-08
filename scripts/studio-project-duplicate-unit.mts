import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { remapStudioProjectForDuplicate } from "../src/lib/studio/duplicate-project";
import {
  collectInitialHydrationAssetIds,
  hydrateStudioProject,
} from "../src/lib/studio/hydration";
import {
  MAX_STUDIO_ASSET_BYTES,
  MAX_STUDIO_AUDIO_DURATION_SECONDS,
} from "../src/lib/studio/limits";
import type { StudioProjectAssetMetadata } from "../src/lib/studio/persistence-client";
import { createStudioRenderSnapshot } from "../src/lib/studio/render/snapshot";
import type { StudioProjectDataV2 } from "../src/lib/studio/server/model";

if (!globalThis.File) {
  globalThis.File = class File extends Blob {
    name: string;
    lastModified = 0;
    constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
      super(parts, options);
      this.name = name;
    }
  } as typeof File;
}

const ORIGINAL_DUPLICATE_MIGRATION =
  "../supabase/migrations/20260912120000_studio_shared_asset_sources_and_duplicate_project.sql";
const LONGFORM_MIGRATION =
  "../supabase/migrations/20260928120000_studio_longform_asset_limits.sql";
const READY_DUPLICATE_MIGRATION =
  "../supabase/migrations/20261002120000_studio_duplicate_project_upload_state_ready.sql";

const voiceAssetId = "11111111-1111-4111-8111-111111111111";
const musicAAssetId = "22222222-2222-4222-8222-222222222222";
const musicBAssetId = "33333333-3333-4333-8333-333333333333";
const longformAssetId = "44444444-4444-4444-8444-444444444444";

function clip(id: string, startTime: number) {
  return {
    id,
    startTime,
    offset: 0,
    duration: 4,
    fadeInDuration: 0,
    fadeOutDuration: 0,
  };
}

const sourceProject: StudioProjectDataV2 = {
  schemaVersion: 2,
  studioVersion: 1,
  editor: { currentTime: 4 },
  slots: [
    { id: "slot-voice", name: "Голос", audioTrackId: "track-voice", trackKind: "voice" },
    { id: "slot-music-a", name: "Музыка", audioTrackId: "track-music-a", trackKind: "music" },
    { id: "slot-music-b", name: "Музыка 2", audioTrackId: "track-music-b", trackKind: "music" },
  ],
  tracks: [
    {
      id: "track-voice",
      assetId: voiceAssetId,
      name: "Голос",
      volume: 1,
      muted: false,
      trackKind: "voice",
      voicePreset: "none",
      clips: [clip("clip-voice", 0)],
    },
    {
      id: "track-music-a",
      assetId: musicAAssetId,
      name: "Основа",
      volume: 0.4,
      muted: true,
      trackKind: "music",
      voicePreset: "none",
      clips: [clip("clip-music-a", 2)],
    },
    {
      id: "track-music-b",
      assetId: musicBAssetId,
      name: "Подложка",
      volume: 0.2,
      muted: false,
      trackKind: "music",
      voicePreset: "none",
      clips: [clip("clip-music-b", 6)],
    },
  ],
};

const duplicate = remapStudioProjectForDuplicate(sourceProject);
assert.equal(duplicate.assets.length, 3);
assert.deepEqual(
  duplicate.assets.map((asset) => asset.sourceAssetId).sort(),
  [voiceAssetId, musicAAssetId, musicBAssetId].sort(),
);
assert.equal(
  new Set(duplicate.assets.map((asset) => asset.assetId)).size,
  3,
  "every duplicate track gets a new asset id",
);
for (const asset of duplicate.assets) {
  assert.notEqual(asset.assetId, asset.sourceAssetId);
}
assert.notEqual(duplicate.projectData.slots[0]?.id, sourceProject.slots[0]?.id);
assert.notEqual(duplicate.projectData.tracks[0]?.id, sourceProject.tracks[0]?.id);
assert.notEqual(duplicate.projectData.tracks[1]?.id, sourceProject.tracks[1]?.id);
assert.notEqual(duplicate.projectData.tracks[2]?.id, sourceProject.tracks[2]?.id);
assert.notEqual(
  duplicate.projectData.tracks[0]?.clips[0]?.id,
  sourceProject.tracks[0]?.clips[0]?.id,
);
assert.notEqual(
  duplicate.projectData.tracks[1]?.clips[0]?.id,
  sourceProject.tracks[1]?.clips[0]?.id,
);
assert.equal(duplicate.projectData.tracks[1]?.volume, 0.4);
assert.equal(duplicate.projectData.tracks[1]?.muted, true);
assert.equal(duplicate.projectData.tracks[1]?.clips[0]?.startTime, 2);
assert.equal(
  duplicate.projectData.tracks[0]?.assetId,
  duplicate.assets.find((asset) => asset.sourceAssetId === voiceAssetId)?.assetId,
);
assert.equal(
  collectInitialHydrationAssetIds(duplicate.projectData.tracks).length,
  3,
);

const originalMigration = await readFile(new URL(ORIGINAL_DUPLICATE_MIGRATION, import.meta.url), "utf8");
const longformMigration = await readFile(new URL(LONGFORM_MIGRATION, import.meta.url), "utf8");
const readyMigration = await readFile(new URL(READY_DUPLICATE_MIGRATION, import.meta.url), "utf8");
const repository = await readFile(new URL("../src/lib/studio/server/repository.ts", import.meta.url), "utf8");
const replaceSql = extractFunction(longformMigration, "replace_studio_project_asset");
const releaseSql = extractFunction(originalMigration, "release_studio_project_asset");
const originalDuplicateSql = extractFunction(originalMigration, "duplicate_studio_project");
const readyDuplicateSql = extractFunction(readyMigration, "duplicate_studio_project");

assert.match(originalMigration, /CREATE TABLE public\.studio_asset_sources/);
assert.match(originalMigration, /INSERT INTO public\.studio_asset_sources/);
assert.match(originalMigration, /DROP CONSTRAINT studio_project_assets_storage_path_key/);
assert.match(originalMigration, /CREATE OR REPLACE FUNCTION public\.duplicate_studio_project/);
assert.match(originalMigration, /pg_advisory_xact_lock/);
assert.match(originalMigration, /guest_project_limit/);
assert.match(originalMigration, /release_studio_project_asset/);
assert.match(originalMigration, /soft_delete_studio_project/);
assert.match(originalMigration, /replace_studio_project_asset/);

assert.match(
  originalDuplicateSql,
  /INSERT INTO public\.studio_project_assets \(\s*id, project_id, source_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type\s*\)/,
);
assert.doesNotMatch(originalDuplicateSql, /upload_state/);
assert.doesNotMatch(originalDuplicateSql, /INSERT INTO public\.studio_asset_sources/);

assert.match(longformMigration, /ALTER COLUMN upload_state SET DEFAULT 'reserved'/);
assert.match(longformMigration, /SET upload_state = 'ready'\s+WHERE upload_state IS NULL/);
assert.doesNotMatch(longformMigration, /duplicate_studio_project/);

assert.match(readyMigration, /CREATE OR REPLACE FUNCTION public\.duplicate_studio_project/);
assert.match(
  readyDuplicateSql,
  /INSERT INTO public\.studio_project_assets \(\s*id, project_id, source_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type,\s*upload_state, upload_state_changed_at\s*\)/,
);
assert.match(readyDuplicateSql, /'ready', now\(\)/);
assert.match(readyDuplicateSql, /source_asset\.source_id/);
assert.doesNotMatch(readyDuplicateSql, /INSERT INTO public\.studio_asset_sources/);
assert.doesNotMatch(readyDuplicateSql, /storage\.objects/);
assert.doesNotMatch(readyDuplicateSql, /file_size_limit|314572800|10800/);
assert.doesNotMatch(readyMigration, /studio_reserve_project_asset|studio_finalize_project_asset/);
assert.doesNotMatch(readyMigration, /MediaElement|createMediaElementSource/);
assert.match(
  readyMigration,
  /REVOKE ALL ON FUNCTION public\.duplicate_studio_project\(uuid, uuid, jsonb, jsonb\) FROM PUBLIC, anon, authenticated/,
);
assert.match(
  readyMigration,
  /GRANT EXECUTE ON FUNCTION public\.duplicate_studio_project\(uuid, uuid, jsonb, jsonb\) TO service_role/,
);
assert.match(readyMigration, /UPDATE public\.studio_project_assets AS ref/);
assert.match(readyMigration, /project\.status = 'active'/);
assert.match(readyMigration, /ref\.upload_state = 'reserved'/);
assert.match(readyMigration, /ref\.source_id IS NOT NULL/);
assert.match(readyMigration, /ref\.source_id <> ref\.id/);
assert.match(readyMigration, /source\.deleted_at IS NULL/);
assert.match(readyMigration, /ref\.deleted_at IS NULL/);
assert.match(readyMigration, /to_regclass\('storage\.objects'\) IS NULL/);
assert.match(readyMigration, /obj\.name IN \(source\.storage_path, ref\.storage_path\)/);
assert.doesNotMatch(readyMigration, /3832ded1-4100-447e-a8d4-7fc6a635f72e/);
assert.doesNotMatch(readyMigration, /3832ded1-4100-4478-a8d4-7fc6a635f72e/);
assert.doesNotMatch(readyMigration, /[Cc]onfirmed broken copy/);
assert.doesNotMatch(readyDuplicateSql, /UPDATE public\.studio_project_assets/);

assert.match(repository, /remapStudioProjectForDuplicate/);
assert.match(repository, /duplicate_studio_project/);
assert.match(repository, /release_studio_project_asset/);
assert.match(repository, /soft_delete_studio_project/);
assert.match(repository, /async function listStudioAssets/);
assert.match(repository, /replaceStudioProjectAsset \/ studio_asset_replaced uses signed reserve\/finalize/);
assert.match(
  extractFunctionTs(repository, "listStudioAssets"),
  /\.eq\("upload_state", "ready"\)/,
);
assert.match(
  extractFunctionTs(repository, "validateStudioProjectAssetReferences"),
  /\.eq\("upload_state", "ready"\)/,
);
assert.doesNotMatch(repository, /storage\.from\(STUDIO_ASSETS_BUCKET\)\.copy/);
assert.doesNotMatch(
  extractFunctionTs(repository, "duplicateStudioProject"),
  /\.upload\(|\.copy\(|arrayBuffer\(/,
);

type SimulatedRef = {
  id: string;
  project_id: string;
  source_id: string;
  storage_path: string;
  deleted_at: string | null;
  upload_state: "reserved" | "ready";
  duration_seconds: number | null;
  size_bytes: number;
};

function listReadyAssets(rows: readonly SimulatedRef[], projectId: string) {
  return rows.filter(
    (row) =>
      row.project_id === projectId &&
      row.deleted_at == null &&
      row.upload_state === "ready",
  );
}

function applyDuplicateInsert(
  mode: "buggy-default-reserved" | "explicit-ready",
  sourceRefs: readonly SimulatedRef[],
  projectId: string,
  assets: readonly { sourceAssetId: string; assetId: string }[],
): SimulatedRef[] {
  return assets.map((asset) => {
    const source = sourceRefs.find((row) => row.id === asset.sourceAssetId);
    assert.ok(source, `source ref ${asset.sourceAssetId} must exist`);
    return {
      id: asset.assetId,
      project_id: projectId,
      source_id: source.source_id,
      storage_path: source.storage_path,
      deleted_at: null,
      upload_state: mode === "explicit-ready" ? "ready" : "reserved",
      duration_seconds: source.duration_seconds,
      size_bytes: source.size_bytes,
    };
  });
}

const sourceRefs: SimulatedRef[] = [
  {
    id: voiceAssetId,
    project_id: "source",
    source_id: voiceAssetId,
    storage_path: `studio/author/source/${voiceAssetId}/voice.wav`,
    deleted_at: null,
    upload_state: "ready",
    duration_seconds: 12,
    size_bytes: 4_000,
  },
  {
    id: musicAAssetId,
    project_id: "source",
    source_id: musicAAssetId,
    storage_path: `studio/author/source/${musicAAssetId}/music-a.mp3`,
    deleted_at: null,
    upload_state: "ready",
    duration_seconds: 40,
    size_bytes: 8_000,
  },
  {
    id: musicBAssetId,
    project_id: "source",
    source_id: musicBAssetId,
    storage_path: `studio/author/source/${musicBAssetId}/music-b.mp3`,
    deleted_at: null,
    upload_state: "ready",
    duration_seconds: 36,
    size_bytes: 7_000,
  },
];
assert.equal(listReadyAssets(sourceRefs, "source").length, 3);

const buggyCopy = applyDuplicateInsert("buggy-default-reserved", sourceRefs, "copy-buggy", duplicate.assets);
assert.equal(buggyCopy.length, 3);
assert.ok(buggyCopy.every((row) => row.upload_state === "reserved"));
assert.ok(buggyCopy.every((row) => row.source_id !== row.id));
assert.deepEqual(
  new Set(buggyCopy.map((row) => row.source_id)),
  new Set(sourceRefs.map((row) => row.source_id)),
);
assert.equal(
  listReadyAssets(buggyCopy, "copy-buggy").length,
  0,
  "reserved duplicate refs are hidden from listStudioAssets",
);

const readyCopy = applyDuplicateInsert("explicit-ready", sourceRefs, "copy-ready", duplicate.assets);
assert.ok(readyCopy.every((row) => row.upload_state === "ready"));
assert.ok(readyCopy.every((row) => row.source_id !== row.id));
assert.deepEqual(
  new Set(readyCopy.map((row) => row.source_id)),
  new Set(sourceRefs.map((row) => row.source_id)),
);
const listedDuplicate = listReadyAssets(readyCopy, "copy-ready");
assert.equal(listedDuplicate.length, 3, "listStudioAssets(duplicate) returns every shared ref");

function metadataFromRef(row: SimulatedRef): StudioProjectAssetMetadata {
  return {
    id: row.id,
    projectId: row.project_id,
    originalName: row.storage_path.split("/").at(-1) ?? "audio.wav",
    mimeType: row.storage_path.endsWith(".mp3") ? "audio/mpeg" : "audio/wav",
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    sourceType: "upload",
    createdAt: "2026-10-02T00:00:00.000Z",
  };
}

function signedPlayback(asset: StudioProjectAssetMetadata) {
  return {
    url: `https://audiolad.ru/storage/v1/object/sign/studio-draft-assets/${asset.id}?token=test`,
    expiresAt: Date.now() + 14_400_000,
    durationSeconds: asset.durationSeconds,
  };
}

const persistedDuplicate = {
  id: "copy-ready",
  name: "Название — копия",
  revision: 1,
  projectData: duplicate.projectData,
};

const missingAudio = await hydrateStudioProject({
  project: persistedDuplicate,
  assets: listReadyAssets(buggyCopy, "copy-buggy").map(metadataFromRef),
  signPlayback: async (asset) => signedPlayback(asset),
});
assert.equal(missingAudio.assets.size, 0);
assert.equal(missingAudio.failures.size, 3);
for (const error of missingAudio.failures.values()) {
  assert.equal(error.message, "Аудиофайл проекта не найден.");
}

const reopened = await hydrateStudioProject({
  project: persistedDuplicate,
  assets: listedDuplicate.map(metadataFromRef),
  signPlayback: async (asset) => signedPlayback(asset),
});
assert.equal(reopened.failures.size, 0);
assert.equal(reopened.assets.size, 3);
for (const asset of duplicate.assets) {
  assert.equal(reopened.assets.has(asset.assetId), true);
  assert.match(reopened.assets.get(asset.assetId)?.playbackUrl ?? "", /studio-draft-assets/);
}

type SourceRow = { id: string; storage_path: string; deleted_at: string | null };
function releaseRef(
  refs: SimulatedRef[],
  sources: SourceRow[],
  assetId: string,
): { refs: SimulatedRef[]; sources: SourceRow[]; releasedPaths: string[] } {
  const nextRefs = refs.map((row) =>
    row.id === assetId && row.deleted_at == null ? { ...row, deleted_at: "now" } : row,
  );
  const releasedPaths: string[] = [];
  const nextSources = sources.map((source) => {
    const stillLive = nextRefs.some((row) => row.source_id === source.id && row.deleted_at == null);
    if (!stillLive && source.deleted_at == null) {
      releasedPaths.push(source.storage_path);
      return { ...source, deleted_at: "now" };
    }
    return source;
  });
  return { refs: nextRefs, sources: nextSources, releasedPaths };
}

function replaceRef(
  refs: SimulatedRef[],
  sources: SourceRow[],
  assetId: string,
  newSourceId: string,
  newPath: string,
): { refs: SimulatedRef[]; sources: SourceRow[]; releasedPaths: string[] } {
  const current = refs.find((row) => row.id === assetId);
  assert.ok(current);
  const sourcesWithNew: SourceRow[] = [
    ...sources,
    { id: newSourceId, storage_path: newPath, deleted_at: null },
  ];
  const nextRefs = refs.map((row) =>
    row.id === assetId
      ? { ...row, source_id: newSourceId, storage_path: newPath }
      : row,
  );
  const releasedPaths: string[] = [];
  const nextSources = sourcesWithNew.map((source) => {
    if (source.id !== current.source_id || source.deleted_at != null) return source;
    const stillLive = nextRefs.some((row) => row.source_id === source.id && row.deleted_at == null);
    if (!stillLive) {
      releasedPaths.push(source.storage_path);
      return { ...source, deleted_at: "now" };
    }
    return source;
  });
  return { refs: nextRefs, sources: nextSources, releasedPaths };
}

assert.match(
  releaseSql,
  /AND NOT EXISTS \(SELECT 1 FROM public\.studio_project_assets ref WHERE ref\.source_id = source\.id AND ref\.deleted_at IS NULL\)/,
);
assert.match(
  replaceSql,
  /INSERT INTO public\.studio_asset_sources/,
);
assert.match(
  replaceSql,
  /AND NOT EXISTS \(SELECT 1 FROM public\.studio_project_assets ref WHERE ref\.source_id = source\.id AND ref\.deleted_at IS NULL\)/,
);

const sharedSources: SourceRow[] = sourceRefs.map((row) => ({
  id: row.source_id,
  storage_path: row.storage_path,
  deleted_at: null,
}));
const allRefs = [...sourceRefs, ...readyCopy];
const deletedCopyVoice = readyCopy.find((row) => row.source_id === voiceAssetId);
assert.ok(deletedCopyVoice);
const afterDelete = releaseRef(allRefs, sharedSources, deletedCopyVoice.id);
assert.equal(afterDelete.releasedPaths.length, 0, "deleting one copy must not destroy the shared source");
assert.equal(
  afterDelete.sources.find((source) => source.id === voiceAssetId)?.deleted_at,
  null,
);
assert.equal(
  afterDelete.refs.find((row) => row.id === voiceAssetId)?.deleted_at,
  null,
);

const afterReplace = replaceRef(
  afterDelete.refs,
  afterDelete.sources,
  deletedCopyVoice.id,
  "55555555-5555-4555-8555-555555555555",
  "studio/author/copy-ready/new/voice.wav",
);
assert.equal(afterReplace.releasedPaths.length, 0, "replacing one copy keeps the original shared source");
assert.equal(
  afterReplace.sources.find((source) => source.id === voiceAssetId)?.deleted_at,
  null,
);
assert.equal(
  afterReplace.refs.find((row) => row.id === deletedCopyVoice.id)?.source_id,
  "55555555-5555-4555-8555-555555555555",
);
assert.equal(
  afterReplace.refs.find((row) => row.id === voiceAssetId)?.source_id,
  voiceAssetId,
);

const longformSource: StudioProjectDataV2 = {
  schemaVersion: 2,
  studioVersion: 1,
  editor: { currentTime: 0 },
  slots: [{ id: "slot-long", name: "Голос", audioTrackId: "track-long", trackKind: "voice" }],
  tracks: [{
    id: "track-long",
    assetId: longformAssetId,
    name: "3 часа",
    volume: 1,
    muted: false,
    trackKind: "voice",
    voicePreset: "none",
    clips: [clip("clip-long", 0)],
  }],
};
const longformDuplicate = remapStudioProjectForDuplicate(longformSource);
assert.equal(longformDuplicate.assets.length, 1);
assert.equal(longformDuplicate.assets[0]?.sourceAssetId, longformAssetId);
assert.notEqual(longformDuplicate.assets[0]?.assetId, longformAssetId);
const longformSourceRef: SimulatedRef = {
  id: longformAssetId,
  project_id: "source-long",
  source_id: longformAssetId,
  storage_path: `studio/author/source-long/${longformAssetId}/long.wav`,
  deleted_at: null,
  upload_state: "ready",
  duration_seconds: MAX_STUDIO_AUDIO_DURATION_SECONDS,
  size_bytes: MAX_STUDIO_ASSET_BYTES,
};
const longformCopy = applyDuplicateInsert(
  "explicit-ready",
  [longformSourceRef],
  "copy-long",
  longformDuplicate.assets,
);
assert.equal(longformCopy[0]?.upload_state, "ready");
assert.equal(longformCopy[0]?.source_id, longformAssetId);
assert.equal(longformCopy[0]?.storage_path, longformSourceRef.storage_path);
assert.equal(longformCopy[0]?.duration_seconds, 10_800);
assert.equal(longformCopy[0]?.size_bytes, MAX_STUDIO_ASSET_BYTES);
assert.doesNotMatch(readyDuplicateSql, /INSERT INTO public\.studio_asset_sources/);

const inProgressUpload: SimulatedRef = {
  id: "66666666-6666-4666-8666-666666666666",
  project_id: "copy-ready",
  source_id: "66666666-6666-4666-8666-666666666666",
  storage_path: "studio/author/copy-ready/in-progress.wav",
  deleted_at: null,
  upload_state: "reserved",
  duration_seconds: null,
  size_bytes: 100,
};
assert.equal(
  listReadyAssets([...readyCopy, inProgressUpload], "copy-ready").length,
  3,
  "ordinary source_id = id reserved uploads stay hidden and are not duplicate refs",
);
assert.equal(inProgressUpload.source_id, inProgressUpload.id);

type RepairCandidate = SimulatedRef & {
  project_status: "active" | "deleted";
  source_deleted_at: string | null;
  storage_exists: boolean;
};

function systemicRepair(rows: readonly RepairCandidate[], catalogPresent: boolean) {
  return rows.filter((row) =>
    row.project_status === "active"
    && row.deleted_at == null
    && row.upload_state === "reserved"
    && row.source_id != null
    && row.source_id !== row.id
    && row.source_deleted_at == null
    && (!catalogPresent || row.storage_exists),
  );
}

const reservedShared: RepairCandidate = {
  id: "77777777-7777-4777-8777-777777777777",
  project_id: "copy-buggy",
  source_id: voiceAssetId,
  storage_path: sourceRefs[0]!.storage_path,
  deleted_at: null,
  upload_state: "reserved",
  duration_seconds: 12,
  size_bytes: 4_000,
  project_status: "active",
  source_deleted_at: null,
  storage_exists: true,
};
const reservedInProgress: RepairCandidate = {
  ...inProgressUpload,
  project_status: "active",
  source_deleted_at: null,
  storage_exists: false,
};
const reservedMissingObject: RepairCandidate = {
  ...reservedShared,
  id: "88888888-8888-4888-8888-888888888888",
  storage_exists: false,
};
const reservedDeletedProject: RepairCandidate = {
  ...reservedShared,
  id: "99999999-9999-4999-8999-999999999999",
  project_status: "deleted",
};
const repaired = systemicRepair(
  [reservedShared, reservedInProgress, reservedMissingObject, reservedDeletedProject],
  true,
);
assert.deepEqual(repaired.map((row) => row.id), [reservedShared.id]);
assert.equal(repaired[0]?.upload_state, "reserved");
const afterRepair = repaired.map((row) => ({ ...row, upload_state: "ready" as const }));
assert.ok(afterRepair.every((row) => row.upload_state === "ready"));
assert.ok(afterRepair.every((row) => row.source_id !== row.id));
assert.equal(
  systemicRepair([reservedInProgress], true).length,
  0,
  "source_id = id reserved uploads are never repaired",
);
assert.equal(
  systemicRepair([reservedMissingObject], true).length,
  0,
  "missing storage object is not flipped when the catalog exists",
);

const route = await readFile(
  new URL("../src/app/api/studio/projects/[projectId]/duplicate/route.ts", import.meta.url),
  "utf8",
);
assert.match(route, /parseUuid/);
assert.match(route, /duplicateStudioProject/);
assert.match(route, /studioRouteError/);

const projectRoute = await readFile(
  new URL("../src/app/api/studio/projects/[projectId]/route.ts", import.meta.url),
  "utf8",
);
assert.match(projectRoute, /listStudioAssets\(projectId\)/);

const library = await readFile(
  new URL("../src/components/studio/StudioProjectLibrary.tsx", import.meta.url),
  "utf8",
);
assert.match(library, /Копировать/);
assert.match(library, /Копируем…/);
assert.match(library, /duplicatingProjectId/);
assert.match(library, /guest_project_limit|STUDIO_GUEST_MAX_PROJECTS/);
assert.match(library, /pointer-events-none fixed/);

const snapshot = createStudioRenderSnapshot({
  project: {
    id: "project-b", author_id: "author", guest_session_id: null, name: "Копия",
    project_data: duplicate.projectData, schema_version: 2, revision: 1,
    status: "active", created_at: "", updated_at: "", last_opened_at: null, deleted_at: null,
  },
  expectedRevision: 1,
  assets: readyCopy.map((row) => ({
    id: row.id,
    project_id: "project-b",
    storage_path: row.storage_path,
    original_name: row.storage_path.split("/").at(-1) ?? "audio",
    mime_type: "audio/mpeg",
    size_bytes: row.size_bytes,
    duration_seconds: row.duration_seconds,
    source_type: "upload" as const,
    created_at: "",
    deleted_at: null,
  })),
});
assert.equal(snapshot.tracks.length, 3);
assert.equal(snapshot.tracks[1]?.clips[0]?.startTime, 2);

function extractFunction(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = sql.indexOf("\n$$;", start);
  assert.ok(end > start, `unterminated function ${name}`);
  return sql.slice(start, end);
}

function extractFunctionTs(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`);
  const fallback = start >= 0 ? start : source.indexOf(`async function ${name}`);
  assert.ok(fallback >= 0, `missing ts function ${name}`);
  const next = source.slice(fallback + 1).search(/\nexport async function |\nasync function /);
  return next >= 0 ? source.slice(fallback, fallback + 1 + next) : source.slice(fallback);
}

console.log("studio-project-duplicate-unit: ok");
