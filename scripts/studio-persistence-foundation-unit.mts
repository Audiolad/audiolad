import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import {
  buildStudioAssetPath,
  parseStudioProjectData,
  parseStudioSourceType,
  sanitizeStudioFilename,
  StudioApiError,
  validateStudioUpload,
} from "../src/lib/studio/server/validation";
import { EMPTY_STUDIO_PROJECT_DATA } from "../src/lib/studio/server/model";
import { studioRouteError } from "../src/lib/studio/server/route-errors";
import { AuthorAccessError } from "../src/lib/author-products/auth";

const authorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const secondAssetId = "44444444-4444-4444-8444-444444444444";

for (const [error, status, code] of [
  [new AuthorAccessError("unauthorized", 401), 401, "unauthorized"],
  [new AuthorAccessError("forbidden", 403), 403, "forbidden"],
  [new StudioApiError("project_conflict", 409), 409, "project_conflict"],
  [new StudioApiError("asset_too_large", 413), 413, "asset_too_large"],
  [new StudioApiError("invalid_project_data", 422), 422, "invalid_project_data"],
  [new Error("unexpected"), 500, "internal_error"],
] as const) {
  const response = studioRouteError(error, "studio-route-errors-unit");
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: code });
}

const validProjectData = {
  schemaVersion: 2,
  studioVersion: 1,
  editor: { currentTime: 0 },
  slots: [{ id: "slot-1", name: "Дорожка 1", audioTrackId: "track-1" }],
  tracks: [{
    id: "track-1",
    assetId,
    name: "Голос",
    volume: 1,
    muted: false,
    voicePreset: "none",
    clips: [
      {
        id: "clip-1",
        startTime: 0,
        offset: 0,
        duration: 2,
        fadeInDuration: 0.2,
        fadeOutDuration: 0.2,
      },
      {
        id: "clip-2",
        startTime: 3,
        offset: 0,
        duration: 1,
        fadeInDuration: 0,
        fadeOutDuration: 0,
      },
    ],
  }],
};

assert.deepEqual(parseStudioProjectData(validProjectData), validProjectData);
assert.deepEqual(
  parseStudioProjectData({
    ...validProjectData,
    tracks: [{ ...validProjectData.tracks[0], volume: 4 }],
  }).tracks[0]?.volume,
  4,
);
assert.equal(
  parseStudioProjectData({
    ...validProjectData,
    tracks: [{ ...validProjectData.tracks[0], voicePreset: "warm" }],
  }).tracks[0]?.voicePreset,
  "focus",
);
assert.throws(
  () => parseStudioProjectData({
    ...validProjectData,
    tracks: [{ ...validProjectData.tracks[0], volume: 4.01 }],
  }),
  (error: unknown) => error instanceof StudioApiError && error.code === "invalid_track",
);
assert.deepEqual(parseStudioProjectData(EMPTY_STUDIO_PROJECT_DATA), {
  schemaVersion: 2,
  studioVersion: 1,
  editor: { currentTime: 0 },
  slots: [
    { id: "slot-voice-1", name: "Голос 1", audioTrackId: null, trackKind: "voice" },
    { id: "slot-music-1", name: "Музыка 1", audioTrackId: null, trackKind: "music" },
  ],
  tracks: [],
});
assert.throws(
  () => parseStudioProjectData({ ...validProjectData, runtime: {} }),
  (error: unknown) =>
    error instanceof StudioApiError && error.code === "runtime_data_not_allowed",
);
assert.throws(
  () => parseStudioProjectData({
    ...validProjectData,
    tracks: [{
      ...validProjectData.tracks[0],
      clips: [{
        ...validProjectData.tracks[0].clips[0],
        fadeInDuration: 1.5,
        fadeOutDuration: 1,
      }],
    }],
  }),
  (error: unknown) => error instanceof StudioApiError && error.code === "invalid_clip",
);
assert.throws(
  () => parseStudioProjectData({
    ...validProjectData,
    tracks: [{
      ...validProjectData.tracks[0],
      clips: [
        validProjectData.tracks[0].clips[0],
        { ...validProjectData.tracks[0].clips[1], startTime: 1 },
      ],
    }],
  }),
  (error: unknown) =>
    error instanceof StudioApiError && error.code === "invalid_ripple_layout",
);
assert.throws(
  () => parseStudioProjectData({
    ...validProjectData,
    tracks: [
      validProjectData.tracks[0],
      {
        ...validProjectData.tracks[0],
        id: "track-2",
        assetId: secondAssetId,
        clips: [{ ...validProjectData.tracks[0].clips[0] }],
      },
    ],
  }),
  (error: unknown) => error instanceof StudioApiError && error.code === "invalid_clip",
);
assert.throws(
  () => parseStudioProjectData({
    ...validProjectData,
    tracks: [
      validProjectData.tracks[0],
      {
        ...validProjectData.tracks[0],
        id: "track-2",
        clips: [],
      },
    ],
  }),
  (error: unknown) =>
    error instanceof StudioApiError && error.code === "duplicate_track_asset",
);
assert.throws(
  () => parseStudioProjectData({
    ...validProjectData,
    tracks: [{
      ...validProjectData.tracks[0],
      fileName: "deprecated.mp3",
    }],
  }),
  (error: unknown) => error instanceof StudioApiError && error.code === "invalid_track",
);

assert.equal(sanitizeStudioFilename("../../voice.mp3"), "voice.mp3");
assert.equal(
  buildStudioAssetPath(authorId, projectId, assetId, "voice.mp3"),
  `studio/${authorId}/${projectId}/${assetId}/voice.mp3`,
);
assert.throws(
  () => parseStudioSourceType("generated"),
  (error: unknown) =>
    error instanceof StudioApiError && error.code === "invalid_source_type",
);
for (const [name, mimeType] of [
  ["voice.mp3", "audio/mpeg"],
  ["voice.wav", "audio/wav"],
  ["voice.wav", "audio/x-wav"],
  ["voice.m4a", "audio/mp4"],
  ["voice.aac", "audio/aac"],
] as const) {
  assert.equal(
    validateStudioUpload({ name, type: mimeType, size: 1 } as File).mimeType,
    mimeType,
  );
}
assert.throws(
  () => validateStudioUpload({ name: "voice.ogg", type: "audio/ogg", size: 1 } as File),
  (error: unknown) =>
    error instanceof StudioApiError && error.code === "unsupported_mime_type",
);
assert.deepEqual(
  validateStudioUpload({
    name: "recording.webm",
    type: "audio/webm;codecs=opus",
    size: 4,
  } as File),
  {
    filename: "recording.webm",
    mimeType: "audio/webm",
    byteSize: 4,
  },
);
assert.deepEqual(
  validateStudioUpload({
    name: "recording.m4a",
    type: "audio/mp4;codecs=mp4a.40.2",
    size: 4,
  } as File),
  {
    filename: "recording.m4a",
    mimeType: "audio/mp4",
    byteSize: 4,
  },
);
assert.throws(
  () => validateStudioUpload({
    name: "voice.mp3",
    type: "audio/mpeg",
    size: 200 * 1024 * 1024 + 1,
  } as File),
  (error: unknown) =>
    error instanceof StudioApiError &&
    error.code === "asset_too_large" &&
    error.status === 413,
);

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260809150000_studio_persistence_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /studio_project_assets/);
assert.match(migration, /'studio-draft-assets'/);
assert.match(migration, /209715200/);
assert.match(migration, /786432000/);
assert.match(migration, /"schemaVersion":2,"studioVersion":1/);
assert.match(migration, /jsonb_typeof\(project_data\) = 'object'/);
assert.match(migration, /studio_projects_author_updated_idx/);
assert.match(migration, /studio_projects_deleted_gc_idx/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /TO service_role/);
assert.doesNotMatch(migration, /CREATE POLICY[^\n]*\n\s+ON storage\.objects/);
assert.doesNotMatch(migration, /studio_assets|studio_set_asset_upload_status|title|document/);

const recordingMimeMigration = await readFile(
  new URL(
    "../supabase/migrations/20260810160000_studio_recording_webm_assets.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(recordingMimeMigration, /array_append\(allowed_mime_types, 'audio\/webm'\)/);
assert.match(recordingMimeMigration, /audio\/webm/);

const repository = await readFile(
  new URL("../src/lib/studio/server/repository.ts", import.meta.url),
  "utf8",
);
assert.match(repository, /\.eq\("project_id", projectId\)/);
assert.match(repository, /cleanupStudioAssetReservation/);
assert.match(repository, /requireAuthorMembership/);
assert.match(repository, /validateStudioProjectAssetReferences/);
assert.match(repository, /parseStudioProjectData\(\(data as StudioProjectRow\)\.project_data\)/);
assert.match(repository, /project_conflict/);
assert.match(repository, /softDeleteStudioProject/);
assert.match(repository, /\.eq\("status", "active"\)/);
assert.match(repository, /status: "deleted"/);
assert.match(repository, /deleted_at: deletedAt/);
assert.doesNotMatch(repository, /last_opened_at: lastOpenedAt/);
assert.doesNotMatch(repository, /createSignedUrl|normalizeStorageSignedUrl/);

const projectsRoute = await readFile(
  new URL("../src/app/api/studio/projects/route.ts", import.meta.url),
  "utf8",
);
assert.match(projectsRoute, /toStudioProjectListItemDto/);
assert.match(projectsRoute, /key !== "authorId" && key !== "name"/);
assert.doesNotMatch(projectsRoute, /projectData/);

const projectRoute = await readFile(
  new URL("../src/app/api/studio/projects/[projectId]/route.ts", import.meta.url),
  "utf8",
);
assert.match(projectRoute, /expectedRevision/);
assert.match(projectRoute, /export async function DELETE/);
assert.match(projectRoute, /softDeleteStudioProject/);
assert.doesNotMatch(projectRoute, /body\?\.revision/);

const routeErrorMapper = await readFile(
  new URL("../src/lib/studio/server/route-errors.ts", import.meta.url),
  "utf8",
);
assert.match(routeErrorMapper, /AuthorAccessError/);
assert.match(routeErrorMapper, /StudioApiError/);
assert.match(routeErrorMapper, /status: error\.status/);
assert.match(routeErrorMapper, /internal_error/);

for (const route of [
  "../src/app/api/studio/projects/route.ts",
  "../src/app/api/studio/projects/[projectId]/route.ts",
  "../src/app/api/studio/projects/[projectId]/assets/route.ts",
  "../src/app/api/studio/projects/[projectId]/assets/[assetId]/route.ts",
]) {
  const source = await readFile(new URL(route, import.meta.url), "utf8");
  assert.match(source, /studioRouteError/);
}

await assert.rejects(
  access(
    new URL(
      "../src/app/api/studio/assets/[assetId]/stream/route.ts",
      import.meta.url,
    ),
  ),
);

console.log("studio persistence foundation contract checks passed");
