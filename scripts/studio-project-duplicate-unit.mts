import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { remapStudioProjectForDuplicate } from "../src/lib/studio/duplicate-project";
import { createStudioRenderSnapshot } from "../src/lib/studio/render/snapshot";

const assetId = "11111111-1111-4111-8111-111111111111";
const source = {
  schemaVersion: 2 as const,
  studioVersion: 1 as const,
  editor: { currentTime: 4 },
  slots: [{ id: "slot-a", name: "Музыка", audioTrackId: "track-a", trackKind: "music" as const }],
  tracks: [{
    id: "track-a", assetId, name: "Основа", volume: 0.4, muted: true,
    trackKind: "music" as const, voicePreset: "none" as const,
    clips: [{ id: "clip-a", startTime: 2, offset: 1, duration: 5, fadeInDuration: 1, fadeOutDuration: 1 }],
  }],
};

const duplicate = remapStudioProjectForDuplicate(source);
assert.equal(duplicate.assets.length, 1);
assert.equal(duplicate.assets[0]?.sourceAssetId, assetId);
assert.notEqual(duplicate.assets[0]?.assetId, assetId);
assert.notEqual(duplicate.projectData.slots[0]?.id, source.slots[0]?.id);
assert.notEqual(duplicate.projectData.tracks[0]?.id, source.tracks[0]?.id);
assert.notEqual(duplicate.projectData.tracks[0]?.clips[0]?.id, source.tracks[0]?.clips[0]?.id);
assert.equal(duplicate.projectData.tracks[0]?.volume, 0.4);
assert.equal(duplicate.projectData.tracks[0]?.muted, true);
assert.equal(duplicate.projectData.tracks[0]?.clips[0]?.startTime, 2);
assert.equal(duplicate.projectData.tracks[0]?.clips[0]?.fadeInDuration, 1);

const migration = await readFile(
  new URL("../supabase/migrations/20260912120000_studio_shared_asset_sources_and_duplicate_project.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /CREATE TABLE public\.studio_asset_sources/);
assert.match(migration, /INSERT INTO public\.studio_asset_sources/);
assert.match(migration, /DROP CONSTRAINT studio_project_assets_storage_path_key/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.duplicate_studio_project/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /guest_project_limit/);
assert.match(migration, /release_studio_project_asset/);
assert.match(migration, /soft_delete_studio_project/);
assert.match(migration, /replace_studio_project_asset/);

const repository = await readFile(new URL("../src/lib/studio/server/repository.ts", import.meta.url), "utf8");
assert.match(repository, /remapStudioProjectForDuplicate/);
assert.match(repository, /duplicate_studio_project/);
assert.match(repository, /replace_studio_project_asset/);
assert.match(repository, /release_studio_project_asset/);
assert.match(repository, /soft_delete_studio_project/);

const route = await readFile(
  new URL("../src/app/api/studio/projects/[projectId]/duplicate/route.ts", import.meta.url),
  "utf8",
);
assert.match(route, /parseUuid/);
assert.match(route, /duplicateStudioProject/);
assert.match(route, /studioRouteError/);

const library = await readFile(
  new URL("../src/components/studio/StudioProjectLibrary.tsx", import.meta.url),
  "utf8",
);
assert.match(library, /Копировать/);
assert.match(library, /Копируем…/);
assert.match(library, /duplicatingProjectId/);
assert.match(library, /guest_project_limit|STUDIO_GUEST_MAX_PROJECTS/);

const snapshot = createStudioRenderSnapshot({
  project: {
    id: "project-b", author_id: "author", guest_session_id: null, name: "Копия",
    project_data: duplicate.projectData, schema_version: 2, revision: 1,
    status: "active", created_at: "", updated_at: "", last_opened_at: null, deleted_at: null,
  },
  expectedRevision: 1,
  assets: [{
    id: duplicate.assets[0]!.assetId, project_id: "project-b",
    storage_path: "studio/author/project-a/asset-a/audio.mp3", original_name: "audio.mp3",
    mime_type: "audio/mpeg", size_bytes: 12, duration_seconds: 10, source_type: "upload",
    created_at: "", deleted_at: null,
  }],
});
assert.equal(snapshot.tracks.length, 1);
assert.equal(snapshot.tracks[0]?.clips[0]?.startTime, 2);

console.log("studio-project-duplicate-unit: ok");
