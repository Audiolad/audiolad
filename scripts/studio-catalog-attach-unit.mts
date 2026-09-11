#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { canUseMusicInStudio } from "../src/lib/studio-music/access";
import {
  STUDIO_MUSIC_ADD_LABEL,
  STUDIO_MUSIC_ADDED_LABEL,
  STUDIO_MUSIC_FREE_ACQUIRE_LABEL,
  formatStudioMusicBuyLabel,
  resolveStudioMusicCatalogAction,
} from "../src/lib/studio-music/catalog-actions";
import {
  CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE,
  CATALOG_MUSIC_RENDER_GUARD_MESSAGE,
  CATALOG_MUSIC_RENDER_NOT_AVAILABLE,
  CATALOG_MUSIC_UNAVAILABLE,
  CATALOG_MUSIC_UNAVAILABLE_MESSAGE,
  authorizeStudioCatalogAttachRefs,
  authorizeStudioCatalogUse,
  canAdoptCatalogAccessPrincipal,
  evaluateLiveCatalogRenderAccess,
  isSameCatalogSelection,
  parseHttpByteRange,
  projectCatalogMusicExportUnavailable,
  projectHasActiveCatalogMusic,
  projectTracksBlockCatalogRender,
  resolveActiveCatalogMusicSelection,
  resolveStudioCatalogAssetTitle,
  studioCatalogAssetDtoContainsForbiddenFields,
  studioCatalogPartialContentHeaders,
  studioCatalogStreamPath,
  studioRenderSnapshotContainsForbiddenCatalogFields,
} from "../src/lib/studio/catalog-asset";
import {
  serializeStudioProjectState,
  STUDIO_PROJECT_SCHEMA_VERSION,
  validateStudioProjectDocument,
} from "../src/lib/studio/persistence";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const PRACTICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUDIO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_AUDIO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";

assert.equal(
  studioCatalogStreamPath(PROJECT_ID, ASSET_ID),
  `/api/studio/projects/${PROJECT_ID}/assets/${ASSET_ID}/stream`,
);

assert.deepEqual(
  authorizeStudioCatalogUse({
    userId: "user-1",
    entitlement: { revoked_at: null },
  }),
  { ok: true },
);
assert.deepEqual(
  authorizeStudioCatalogUse({
    userId: "user-1",
    isAuthorMember: true,
  }),
  { ok: true },
);
assert.deepEqual(
  authorizeStudioCatalogUse({ userId: "user-1" }),
  { ok: false, status: 403, code: "catalog_music_forbidden" },
);
assert.deepEqual(
  authorizeStudioCatalogUse({
    userId: "user-1",
    entitlement: { revoked_at: "2026-09-01T00:00:00Z" },
    forPlayback: true,
  }),
  { ok: false, status: 403, code: "catalog_music_unavailable" },
);
assert.deepEqual(
  authorizeStudioCatalogUse({ userId: null }),
  { ok: false, status: 401, code: "unauthenticated" },
);

assert.equal(
  canUseMusicInStudio({ entitlement: { revoked_at: null } }),
  true,
);
assert.equal(
  canUseMusicInStudio({ entitlement: null, isAuthorMember: true }),
  true,
);
assert.equal(
  canUseMusicInStudio({ entitlement: { revoked_at: "x" }, isAuthorMember: false }),
  false,
);
assert.equal(canUseMusicInStudio({ entitlement: null }), false);

assert.deepEqual(
  authorizeStudioCatalogAttachRefs({
    practiceId: PRACTICE_ID,
    audioItemId: AUDIO_ID,
    practice: {
      id: PRACTICE_ID,
      deleted_at: null,
      product_kind: "music",
    },
    audioItem: {
      id: AUDIO_ID,
      practice_id: PRACTICE_ID,
      duration_seconds: 120,
      title: "Рассвет",
    },
  }),
  { ok: true },
);
const mismatchedRefs = authorizeStudioCatalogAttachRefs({
  practiceId: PRACTICE_ID,
  audioItemId: AUDIO_ID,
  practice: { id: PRACTICE_ID, deleted_at: null, product_kind: "music" },
  audioItem: { id: AUDIO_ID, practice_id: OTHER_AUDIO, duration_seconds: 12 },
});
assert.equal(mismatchedRefs.ok, false);
if (!mismatchedRefs.ok) {
  assert.equal(mismatchedRefs.code, "invalid_catalog_audio_item");
}

assert.equal(resolveStudioCatalogAssetTitle({ title: "  Рассвет " }), "Рассвет");

assert.equal(
  studioCatalogAssetDtoContainsForbiddenFields({
    id: ASSET_ID,
    sourceType: "catalog",
    storage_path: "practice-audio/secret.mp3",
  }),
  true,
);
assert.equal(
  studioCatalogAssetDtoContainsForbiddenFields({
    id: ASSET_ID,
    url: "https://example.test/storage/v1/object/sign/practice-audio/x",
  }),
  true,
);
assert.equal(
  studioCatalogAssetDtoContainsForbiddenFields({
    id: ASSET_ID,
    sourceType: "catalog",
    catalogPracticeId: PRACTICE_ID,
    catalogAudioItemId: AUDIO_ID,
    available: true,
  }),
  false,
);

assert.equal(
  projectHasActiveCatalogMusic({
    tracks: [{ assetId: ASSET_ID, clips: [{ id: "c" }] }],
    assets: [{ id: ASSET_ID, sourceType: "catalog" }],
  }),
  true,
);
assert.equal(
  projectHasActiveCatalogMusic({
    tracks: [{ assetId: ASSET_ID, clips: [] }],
    assets: [{ id: ASSET_ID, sourceType: "catalog" }],
  }),
  false,
);
assert.equal(
  projectHasActiveCatalogMusic({
    tracks: [{ assetId: ASSET_ID, clips: [{ id: "c" }] }],
    assets: [{ id: ASSET_ID, sourceType: "upload" }],
  }),
  false,
);
assert.equal(
  projectTracksBlockCatalogRender([
    { sourceType: "catalog", clips: [{ id: "c" }] },
  ]),
  true,
);
assert.equal(
  projectTracksBlockCatalogRender([
    { sourceType: "upload", clips: [{ id: "c" }] },
  ]),
  false,
);
assert.equal(
  projectCatalogMusicExportUnavailable([
    { sourceType: "catalog", clips: [{ id: "c" }], status: "ready" },
  ]),
  false,
);
assert.equal(
  projectCatalogMusicExportUnavailable([
    { sourceType: "catalog", clips: [{ id: "c" }], status: "error", available: false },
  ]),
  true,
);
assert.equal(
  projectCatalogMusicExportUnavailable([
    { sourceType: "upload", clips: [{ id: "c" }], status: "ready" },
  ]),
  false,
);

assert.equal(
  canAdoptCatalogAccessPrincipal({
    catalogAccessUserId: null,
    currentUserId: "user-1",
    hasProjectAccess: true,
    canUseMusicInStudio: true,
  }),
  true,
);
assert.equal(
  canAdoptCatalogAccessPrincipal({
    catalogAccessUserId: "already-set",
    currentUserId: "user-2",
    hasProjectAccess: true,
    canUseMusicInStudio: true,
  }),
  false,
);
assert.equal(
  canAdoptCatalogAccessPrincipal({
    catalogAccessUserId: null,
    currentUserId: "user-1",
    hasProjectAccess: true,
    canUseMusicInStudio: false,
  }),
  false,
);

const liveOk = evaluateLiveCatalogRenderAccess({
  jobProjectId: PROJECT_ID,
  snapshotAssetId: ASSET_ID,
  snapshotPracticeId: PRACTICE_ID,
  snapshotAudioItemId: AUDIO_ID,
  live: {
    id: ASSET_ID,
    project_id: PROJECT_ID,
    source_type: "catalog",
    deleted_at: null,
    catalog_practice_id: PRACTICE_ID,
    catalog_audio_item_id: AUDIO_ID,
    catalog_access_user_id: "user-1",
  },
  canUseMusicInStudio: true,
  audioItem: { id: AUDIO_ID, practice_id: PRACTICE_ID, audio_path: "music/dawn.mp3" },
  requireAudioPath: true,
});
assert.equal(liveOk.ok, true);
if (liveOk.ok) {
  assert.equal(liveOk.audioPath, "music/dawn.mp3");
}
assert.deepEqual(
  evaluateLiveCatalogRenderAccess({
    jobProjectId: PROJECT_ID,
    snapshotAssetId: ASSET_ID,
    snapshotPracticeId: PRACTICE_ID,
    snapshotAudioItemId: AUDIO_ID,
    live: {
      id: ASSET_ID,
      project_id: PROJECT_ID,
      source_type: "catalog",
      deleted_at: null,
      catalog_practice_id: PRACTICE_ID,
      catalog_audio_item_id: AUDIO_ID,
      catalog_access_user_id: "user-1",
    },
    canUseMusicInStudio: false,
    requireAudioPath: false,
  }),
  { ok: false, code: CATALOG_MUSIC_UNAVAILABLE },
);
assert.deepEqual(
  evaluateLiveCatalogRenderAccess({
    jobProjectId: PROJECT_ID,
    snapshotAssetId: ASSET_ID,
    snapshotPracticeId: PRACTICE_ID,
    snapshotAudioItemId: AUDIO_ID,
    live: {
      id: ASSET_ID,
      project_id: PROJECT_ID,
      source_type: "catalog",
      deleted_at: null,
      catalog_practice_id: PRACTICE_ID,
      catalog_audio_item_id: AUDIO_ID,
      catalog_access_user_id: "user-1",
    },
    canUseMusicInStudio: true,
    audioItem: { id: AUDIO_ID, practice_id: PRACTICE_ID, audio_path: "" },
    requireAudioPath: true,
  }),
  { ok: false, code: CATALOG_MUSIC_UNAVAILABLE },
);

assert.equal(
  isSameCatalogSelection({
    selectedPracticeId: PRACTICE_ID,
    selectedAudioItemId: AUDIO_ID,
    practiceId: PRACTICE_ID,
    audioItemId: AUDIO_ID,
  }),
  true,
);
assert.deepEqual(
  resolveActiveCatalogMusicSelection({
    slots: [{ trackKind: "music", audioTrackId: "track-1" }],
    tracks: [{
      id: "track-1",
      sourceType: "catalog",
      catalogPracticeId: PRACTICE_ID,
      catalogAudioItemId: AUDIO_ID,
    }],
  }),
  { practiceId: PRACTICE_ID, audioItemId: AUDIO_ID },
);

const range = parseHttpByteRange("bytes=0-1023", 4096);
assert.deepEqual(range, { kind: "partial", start: 0, end: 1023 });
const headers = studioCatalogPartialContentHeaders({
  start: 0,
  end: 1023,
  size: 4096,
  mimeType: "audio/mpeg",
});
assert.equal(headers["Accept-Ranges"], "bytes");
assert.equal(headers["Content-Range"], "bytes 0-1023/4096");
assert.equal(headers["Content-Length"], "1024");
assert.equal(headers["Content-Type"], "audio/mpeg");
assert.equal(parseHttpByteRange("bytes=9000-9010", 4096).kind, "unsatisfiable");

const catalogDocument = serializeStudioProjectState({
  currentTime: 0,
  slots: [
    { id: "slot-voice-1", name: "Голос 1", audioTrackId: null, trackKind: "voice" },
    { id: "slot-music-1", name: "Музыка 1", audioTrackId: "track-1", trackKind: "music" },
  ],
  tracks: [{
    id: "track-1",
    assetId: ASSET_ID,
    name: "Рассвет",
    volume: 1,
    muted: false,
    trackKind: "music",
    voicePreset: "none",
    assetPersistenceStatus: "saved",
    clips: [{
      id: "clip-1",
      startTime: 0,
      offset: 0,
      duration: 12,
      fadeInDuration: 0,
      fadeOutDuration: 0,
    }],
  }],
});
assert.equal(catalogDocument.document.schemaVersion, STUDIO_PROJECT_SCHEMA_VERSION);
assert.equal(catalogDocument.document.schemaVersion, 2);
assert.deepEqual(Object.keys(catalogDocument.document.tracks[0]).sort(), [
  "assetId",
  "clips",
  "id",
  "muted",
  "name",
  "trackKind",
  "voicePreset",
  "volume",
]);
assert.equal(catalogDocument.document.tracks[0].assetId, ASSET_ID);
assert.ok(!("practice_id" in catalogDocument.document.tracks[0]));
assert.ok(!("sourceType" in catalogDocument.document.tracks[0]));
assert.ok(!("catalogPracticeId" in catalogDocument.document.tracks[0]));
validateStudioProjectDocument(catalogDocument.document);

const entitledAction = resolveStudioMusicCatalogAction({
  is_free: false,
  studio_is_free: false,
  studio_effective_minor: 100000,
  ownership: {
    can_acquire: false,
    can_use: true,
    is_owned: true,
    is_author_member: false,
    grant_source: "purchase",
  },
});
assert.equal(entitledAction.kind, "available");
assert.equal(STUDIO_MUSIC_ADD_LABEL, "Добавить в проект");
assert.equal(STUDIO_MUSIC_ADDED_LABEL, "Добавлено");
assert.equal(STUDIO_MUSIC_FREE_ACQUIRE_LABEL, "Получить бесплатно");
assert.match(formatStudioMusicBuyLabel(24900), /Купить для Студии за/);

assert.equal(CATALOG_MUSIC_RENDER_NOT_AVAILABLE, "catalog_music_render_not_available");
assert.equal(
  CATALOG_MUSIC_RENDER_GUARD_MESSAGE,
  "Экспорт с музыкой из каталога пока недоступен",
);
assert.equal(CATALOG_MUSIC_UNAVAILABLE_MESSAGE, "Музыка из каталога недоступна.");
assert.equal(
  CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE,
  "Музыка из каталога больше недоступна для экспорта.",
);
assert.equal(CATALOG_MUSIC_UNAVAILABLE, "catalog_music_unavailable");

const model = read("src/lib/studio/server/model.ts");
assert.match(model, /source_type === "catalog"/);
assert.match(model, /catalogPracticeId/);
assert.match(model, /peaks: asset\.source_type === "catalog" \? null/);
assert.doesNotMatch(model, /dto\.storage_path/);
assert.doesNotMatch(model, /storagePath:/);
assert.doesNotMatch(model, /catalogAccessUserId/);
assert.doesNotMatch(model, /dto\.catalog_access_user_id/);

const repository = read("src/lib/studio/server/repository.ts");
assert.match(repository, /catalog_access_user_id/);

const attachRoute = read("src/app/api/studio/projects/[projectId]/assets/catalog/route.ts");
assert.match(attachRoute, /practiceId/);
assert.match(attachRoute, /audioItemId/);
assert.match(attachRoute, /storage_path/);
assert.match(attachRoute, /authorId/);
assert.match(attachRoute, /attachStudioCatalogAsset/);

const streamRoute = read("src/app/api/studio/projects/[projectId]/assets/[assetId]/stream/route.ts");
assert.match(streamRoute, /proxyStudioCatalogAssetStream/);
assert.match(streamRoute, /source_type !== "catalog"/);

const catalogServer = read("src/lib/studio/server/catalog-assets.ts");
assert.match(catalogServer, /can_use_music_in_studio/);
assert.match(catalogServer, /attach_studio_catalog_project_asset/);
assert.match(catalogServer, /createSignedUrl/);
assert.match(catalogServer, /practice-audio/);
assert.match(catalogServer, /Range/);
assert.match(catalogServer, /upstream\.body/);
assert.doesNotMatch(catalogServer, /user_practices/);
assert.match(catalogServer, /studioCatalogStreamPath/);
assert.match(catalogServer, /studio_catalog_attach_error/);
assert.match(catalogServer, /error\.code/);
assert.match(catalogServer, /error\.details/);
assert.match(catalogServer, /error\.hint/);
assert.match(catalogServer, /internal_error/);

const workerRuntime = read("src/lib/studio/render/worker-runtime.ts");
assert.match(workerRuntime, /materializeCatalogRenderSource/);
assert.match(workerRuntime, /assertCatalogRenderAccessStillValid/);
assert.doesNotMatch(workerRuntime, /user_practices/);
assert.doesNotMatch(workerRuntime, /from\(assetsBucket\).*catalog/);
const catalogSource = read("src/lib/studio/render/catalog-source.ts");
assert.match(catalogSource, /practice-audio/);
assert.match(catalogSource, /can_use_music_in_studio/);
assert.doesNotMatch(catalogSource, /user_practices/);
assert.doesNotMatch(catalogSource, /studio-draft-assets/);

const hotfixSql = read(
  "supabase/migrations/20261004120100_studio_catalog_attach_asset_id.sql",
);
assert.match(hotfixSql, /INSERT INTO public\.studio_project_assets \(\s*id,/);
assert.match(hotfixSql, /gen_random_uuid\(\)/);
assert.doesNotMatch(hotfixSql, /ALTER COLUMN id SET DEFAULT/);
assert.doesNotMatch(hotfixSql, /FROM public\.user_practices/);
assert.doesNotMatch(hotfixSql, /JOIN public\.user_practices/);

const signedPlayback = read("src/lib/studio/server/signed-playback.ts");
assert.match(signedPlayback, /createStudioCatalogPlaybackDescriptor/);
assert.match(signedPlayback, /source_type === "catalog"/);

const renderJobs = read("src/lib/studio/server/render-jobs.ts");
assert.match(renderJobs, /authorizeCatalogAssetsForStudioRender/);
assert.match(renderJobs, /tryGetAuthenticatedUserId/);
assert.doesNotMatch(renderJobs, /CATALOG_MUSIC_RENDER_NOT_AVAILABLE/);
assert.doesNotMatch(renderJobs, /projectHasActiveCatalogMusic/);
assert.doesNotMatch(
  renderJobs,
  /throw new StudioApiError\(CATALOG_MUSIC_RENDER_NOT_AVAILABLE, 422\)/,
);

const snapshot = read("src/lib/studio/render/snapshot.ts");
assert.match(snapshot, /source_type === "catalog"/);
assert.match(snapshot, /practiceId: asset\.catalog_practice_id/);
assert.match(snapshot, /audioItemId: asset\.catalog_audio_item_id/);
assert.doesNotMatch(snapshot, /catalogAccessUserId:/);
assert.doesNotMatch(snapshot, /audio_path:/);
assert.doesNotMatch(snapshot, /audioPath:/);

const provider = read("src/components/studio/StudioAudioProvider.tsx");
assert.match(provider, /ingestCatalogAsset/);
assert.match(provider, /studioCatalogStreamPath/);
assert.match(provider, /sourceType: "catalog"/);
assert.doesNotMatch(provider, /practice-audio/);

const shell = read("src/components/studio/StudioEditorShell.tsx");
assert.match(shell, /attachStudioCatalogAsset/);
assert.match(shell, /ingestCatalogAsset/);
assert.match(shell, /serializeStudioProjectState/);
assert.match(shell, /CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE/);
assert.match(shell, /projectCatalogMusicExportUnavailable/);
assert.doesNotMatch(shell, /CATALOG_MUSIC_RENDER_GUARD_MESSAGE/);
assert.doesNotMatch(shell, /projectTracksBlockCatalogRender/);

assert.equal(
  studioRenderSnapshotContainsForbiddenCatalogFields({
    sourceType: "catalog",
    practiceId: PRACTICE_ID,
    audioItemId: AUDIO_ID,
    audio_path: "secret.mp3",
  }),
  true,
);
assert.equal(
  studioRenderSnapshotContainsForbiddenCatalogFields({
    sourceType: "catalog",
    practiceId: PRACTICE_ID,
    audioItemId: AUDIO_ID,
    mimeType: "audio/mpeg",
    durationSeconds: 12,
  }),
  false,
);

const pr5Sql = read("supabase/migrations/20261004120200_studio_catalog_render_principal.sql");
assert.match(pr5Sql, /catalog_access_user_id/);
assert.match(pr5Sql, /p_user_id/);
assert.doesNotMatch(pr5Sql, /FROM public\.user_practices/);

const ffmpegWorkflow = read(".github/workflows/studio-catalog-render-ffmpeg.yml");
assert.match(ffmpegWorkflow, /name: Studio Catalog Render FFmpeg/);
assert.match(ffmpegWorkflow, /AUDIOLAD_REQUIRE_FFMPEG: "1"/);
assert.match(ffmpegWorkflow, /sudo apt-get install -y ffmpeg/);
assert.match(ffmpegWorkflow, /ffmpeg -version/);
assert.match(ffmpegWorkflow, /ffprobe -version/);
assert.match(ffmpegWorkflow, /npm run test:studio-catalog-music-render/);

const client = read("src/lib/studio/persistence-client.ts");
assert.match(client, /attachStudioCatalogAsset/);
assert.match(client, /catalog_music_unavailable/);
assert.match(client, /больше недоступна для экспорта/);
assert.match(client, /"storage_path" in record/);

const preview = read("src/lib/studio-music/preview.ts");
assert.match(preview, /preview/);
assert.doesNotMatch(preview, /studioCatalogStreamPath/);

console.log("studio-catalog-attach-unit: ok");
