import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import {
  CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE,
  CATALOG_MUSIC_UNAVAILABLE,
  studioRenderSnapshotContainsForbiddenCatalogFields,
} from "../src/lib/studio/catalog-asset";
import { createStudioRenderSnapshot } from "../src/lib/studio/render/snapshot";
import { buildStudioRenderTimeline } from "../src/lib/studio/render/timeline";
import {
  authorizeCatalogAssetsForStudioRender,
  StudioCatalogMusicUnavailableError,
} from "../src/lib/studio/render/catalog-source";
import {
  executeClaimedStudioRenderJob,
  failClaimedStudioRenderJob,
} from "../src/lib/studio/render/worker-runtime";
import type { ClaimedStudioRenderJob } from "../src/lib/studio/render/worker";
import type { StudioRenderSnapshot } from "../src/lib/studio/render/types";
type StudioProjectAssetRow = {
  id: string;
  project_id: string;
  storage_path: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  source_type: "upload" | "recording" | "catalog";
  catalog_practice_id?: string | null;
  catalog_audio_item_id?: string | null;
  catalog_access_user_id?: string | null;
  created_at: string;
  deleted_at: string | null;
};

type StudioProjectRow = {
  id: string;
  author_id: string | null;
  guest_session_id: string | null;
  name: string;
  schema_version: number;
  revision: number;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  deleted_at: string | null;
  project_data: {
    schemaVersion: 2;
    studioVersion: 1;
    editor: { currentTime: number };
    slots: Array<{ id: string; name: string; audioTrackId: string | null; trackKind: "voice" | "music" }>;
    tracks: Array<{
      id: string;
      assetId: string;
      name: string;
      volume: number;
      muted: boolean;
      trackKind: "voice" | "music";
      voicePreset: "none";
      clips: Array<{
        id: string;
        startTime: number;
        offset: number;
        duration: number;
        fadeInDuration: number;
        fadeOutDuration: number;
      }>;
    }>;
  };
};

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const VOICE_ID = "22222222-2222-4222-8222-222222222222";
const CATALOG_ID = "33333333-3333-4333-8333-333333333333";
const PRACTICE_ID = "44444444-4444-4444-8444-444444444444";
const AUDIO_ID = "55555555-5555-4555-8555-555555555555";
const PRINCIPAL_ID = "66666666-6666-4666-8666-666666666666";
const CURRENT_USER = "77777777-7777-4777-8777-777777777777";
const RATE = 44_100;

function makeFloatWav(samples: Float32Array): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(samples.byteLength + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2 * 4, 28);
  header.writeUInt16LE(2 * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.byteLength, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

function createConstantWav(durationSeconds: number, amplitude: number): Buffer {
  return makeFloatWav(new Float32Array(Math.round(durationSeconds * RATE) * 2).fill(amplitude));
}

function pcmSamples(wav: Buffer): Float32Array {
  const dataOffset = wav.indexOf("data") + 8;
  const dataLength = wav.readUInt32LE(dataOffset - 4);
  const bytes = Uint8Array.from(wav.subarray(dataOffset, dataOffset + dataLength));
  return new Float32Array(bytes.buffer);
}

function peak(samples: Float32Array, start = 0, end = samples.length): number {
  let value = 0;
  for (let index = start; index < end; index += 1) value = Math.max(value, Math.abs(samples[index]));
  return value;
}

function projectRow(): StudioProjectRow {
  return {
    id: PROJECT_ID,
    author_id: "author",
    guest_session_id: null,
    name: "Catalog render",
    schema_version: 2,
    revision: 3,
    status: "active",
    created_at: "",
    updated_at: "",
    last_opened_at: null,
    deleted_at: null,
    project_data: {
      schemaVersion: 2,
      studioVersion: 1,
      editor: { currentTime: 0 },
      slots: [
        { id: "voice", name: "Voice", audioTrackId: "voice-track", trackKind: "voice" },
        { id: "music", name: "Music", audioTrackId: "music-track", trackKind: "music" },
      ],
      tracks: [
        {
          id: "voice-track",
          assetId: VOICE_ID,
          name: "Voice",
          volume: 1,
          muted: false,
          trackKind: "voice",
          voicePreset: "none",
          clips: [{
            id: "voice-a",
            startTime: 0.2,
            offset: 0,
            duration: 0.8,
            fadeInDuration: 0,
            fadeOutDuration: 0,
          }],
        },
        {
          id: "music-track",
          assetId: CATALOG_ID,
          name: "Dawn",
          volume: 0.4,
          muted: false,
          trackKind: "music",
          voicePreset: "none",
          clips: [{
            id: "music-a",
            startTime: 0,
            offset: 0.1,
            duration: 2,
            fadeInDuration: 0.1,
            fadeOutDuration: 0.1,
          }],
        },
      ],
    },
  };
}

function uploadAsset(): StudioProjectAssetRow {
  return {
    id: VOICE_ID,
    project_id: PROJECT_ID,
    storage_path: `studio/author/${PROJECT_ID}/${VOICE_ID}/voice.wav`,
    original_name: "voice.wav",
    mime_type: "audio/wav",
    size_bytes: 12,
    duration_seconds: 3,
    source_type: "upload",
    created_at: "",
    deleted_at: null,
  };
}

function catalogAsset(overrides: Partial<StudioProjectAssetRow> = {}): StudioProjectAssetRow {
  return {
    id: CATALOG_ID,
    project_id: PROJECT_ID,
    storage_path: null,
    original_name: "Dawn",
    mime_type: "audio/mpeg",
    size_bytes: 0,
    duration_seconds: 3,
    source_type: "catalog",
    catalog_practice_id: PRACTICE_ID,
    catalog_audio_item_id: AUDIO_ID,
    catalog_access_user_id: PRINCIPAL_ID,
    created_at: "",
    deleted_at: null,
    ...overrides,
  };
}

function claimedJob(snapshot: StudioRenderSnapshot): ClaimedStudioRenderJob {
  return {
    id: "job-1",
    project_id: PROJECT_ID,
    guest_session_id: null,
    lease_token: "lease-1",
    project_snapshot: snapshot,
  };
}

type FakeState = {
  assets: StudioProjectAssetRow[];
  audioItems: Array<{ id: string; practice_id: string; audio_path: string | null }>;
  canUse: (userId: string, practiceId: string) => boolean;
  files: Map<string, Buffer>;
  downloads: string[];
  uploads: Array<{ bucket: string; path: string; bytes: number }>;
  queriedTables: string[];
  canUseCalls: Array<{ userId: string; practiceId: string }>;
};

function createFakeService(state: FakeState) {
  const matchRow = (table: string, filters: Record<string, unknown>) => {
    if (table === "studio_project_assets") {
      return state.assets.find((row) =>
        Object.entries(filters).every(([key, value]) => {
          if (value === null) return (row as Record<string, unknown>)[key] == null;
          return (row as Record<string, unknown>)[key] === value;
        }),
      ) ?? null;
    }
    if (table === "audio_items") {
      return state.audioItems.find((row) =>
        Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
      ) ?? null;
    }
    return null;
  };

  const query = (table: string) => {
    state.queriedTables.push(table);
    const filters: Record<string, unknown> = {};
    let updatePayload: Record<string, unknown> | null = null;
    const builder = {
      select() { return builder; },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      is(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        updatePayload = payload;
        return builder;
      },
      async maybeSingle() {
        if (updatePayload && table === "studio_project_assets") {
          const row = matchRow(table, filters) as StudioProjectAssetRow | null;
          if (!row) return { data: null, error: null };
          Object.assign(row, updatePayload);
          return { data: { catalog_access_user_id: row.catalog_access_user_id }, error: null };
        }
        return { data: matchRow(table, filters), error: null };
      },
    };
    return builder;
  };

  return {
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "can_use_music_in_studio") {
        const userId = String(args.p_user_id);
        const practiceId = String(args.p_practice_id);
        state.canUseCalls.push({ userId, practiceId });
        return Promise.resolve({ data: state.canUse(userId, practiceId), error: null });
      }
      if (name === "renew_studio_render_job_lease") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
    },
    from(table: string) {
      return query(table);
    },
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            state.downloads.push(`${bucket}:${path}`);
            const bytes = state.files.get(`${bucket}:${path}`);
            if (!bytes) return { data: null, error: { message: "missing" } };
            return {
              data: {
                arrayBuffer: async () =>
                  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
              },
              error: null,
            };
          },
          async upload(path: string, body: NodeJS.ReadableStream) {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              const stream = body as Readable;
              stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
              stream.on("end", () => resolve());
              stream.on("error", reject);
              if (typeof (stream as { resume?: () => void }).resume === "function") {
                stream.resume();
              }
            });
            const bytes = Buffer.concat(chunks);
            state.uploads.push({ bucket, path, bytes: bytes.length });
            state.files.set(`${bucket}:${path}`, bytes);
            return { error: null };
          },
        };
      },
    },
  };
}

async function listRenderWorkspaces(): Promise<string[]> {
  return (await readdir(tmpdir())).filter((name) => name.startsWith("audiolad-render-"));
}

async function main() {
  const snapshot = createStudioRenderSnapshot({
    project: projectRow(),
    expectedRevision: 3,
    assets: [uploadAsset(), catalogAsset()],
  });
  assert.equal(snapshot.project.schemaVersion, 2);
  const upload = snapshot.assets.find((asset) => asset.id === VOICE_ID);
  const catalog = snapshot.assets.find((asset) => asset.id === CATALOG_ID);
  assert.ok(upload && catalog);
  assert.equal(upload.sourceType, "upload");
  if (upload.sourceType === "upload" || upload.sourceType === "recording") {
    assert.equal(upload.storagePath, `studio/author/${PROJECT_ID}/${VOICE_ID}/voice.wav`);
  }
  assert.equal(catalog.sourceType, "catalog");
  if (catalog.sourceType === "catalog") {
    assert.equal(catalog.practiceId, PRACTICE_ID);
    assert.equal(catalog.audioItemId, AUDIO_ID);
    assert.equal("storagePath" in catalog, false);
  }
  assert.equal(studioRenderSnapshotContainsForbiddenCatalogFields(snapshot), false);
  assert.doesNotMatch(JSON.stringify(snapshot), /audio_path|catalog_access_user_id|signedUrl|practice-audio/);
  assert.equal(buildStudioRenderTimeline(snapshot).durationSeconds, 2);

  const publicJob = {
    id: "job-1",
    status: "queued",
    project_snapshot: snapshot,
  };
  assert.doesNotMatch(JSON.stringify(publicJob), /audio_path|catalog_access_user_id/);

  const voiceWav = createConstantWav(3, 0.8);
  const musicWav = createConstantWav(3, 0.25);
  const voiceStorage = `studio/author/${PROJECT_ID}/${VOICE_ID}/voice.wav`;
  const catalogAudioPath = `music/${PRACTICE_ID}/dawn.wav`;

  const baseState = (): FakeState => ({
    assets: [uploadAsset(), catalogAsset()],
    audioItems: [{ id: AUDIO_ID, practice_id: PRACTICE_ID, audio_path: catalogAudioPath }],
    canUse: (userId) => userId === PRINCIPAL_ID,
    files: new Map([
      [`studio-draft-assets:${voiceStorage}`, voiceWav],
      [`practice-audio:${catalogAudioPath}`, musicWav],
    ]),
    downloads: [],
    uploads: [],
    queriedTables: [],
    canUseCalls: [],
  });

  const job = claimedJob(snapshot);
  const beforeWorkspaces = new Set(await listRenderWorkspaces());

  // A: active entitlement → materialize → render
  const stateA = baseState();
  const resultA = await executeClaimedStudioRenderJob(createFakeService(stateA) as never, job);
  assert.ok(resultA.sizeBytes > 500);
  assert.ok(stateA.downloads.includes(`practice-audio:${catalogAudioPath}`));
  assert.ok(stateA.downloads.includes(`studio-draft-assets:${voiceStorage}`));
  assert.ok(stateA.uploads.some((item) => item.bucket === "studio-renders" && item.bytes > 500));
  assert.ok(stateA.canUseCalls.every((call) => call.userId === PRINCIPAL_ID));
  assert.ok(!stateA.downloads.some((item) => item.startsWith("studio-draft-assets:") && item.includes("dawn")));
  assert.doesNotMatch(JSON.stringify(snapshot), /audio_path/);

  const uploadedA = stateA.files.get(`studio-renders:${stateA.uploads[0].path}`);
  assert.ok(uploadedA);
  const decodeRoot = await mkdtemp(join(tmpdir(), "audiolad-catalog-mix-"));
  try {
    const encodedPath = join(decodeRoot, "mix.mp3");
    const decodedPath = join(decodeRoot, "mix.wav");
    await writeFile(encodedPath, uploadedA);
    const decoded = spawnSync("ffmpeg", [
      "-hide_banner", "-nostdin", "-y", "-i", encodedPath,
      "-c:a", "pcm_f32le", "-ar", String(RATE), "-ac", "2", decodedPath,
    ], { encoding: "utf8" });
    assert.equal(decoded.status, 0, decoded.stderr);
    const samples = pcmSamples(await readFile(decodedPath));
    const mid = peak(samples, Math.round(0.3 * RATE) * 2, Math.round(0.9 * RATE) * 2);
    const musicOnly = peak(samples, Math.round(1.2 * RATE) * 2, Math.round(1.8 * RATE) * 2);
    assert(mid > musicOnly, `mix region must be louder than music-only tail: ${mid} vs ${musicOnly}`);
    assert(musicOnly > 0.01, "catalog music tail must be present");
    const probe = spawnSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", encodedPath,
    ], { encoding: "utf8" });
    assert.equal(probe.status, 0, probe.stderr);
    const duration = Number(probe.stdout.trim());
    assert(Math.abs(duration - 2) < 0.35, `mix duration ${duration} must match timeline 2s`);
  } finally {
    await rm(decodeRoot, { recursive: true, force: true });
  }

  // B: author membership (same canonical RPC, different principal already stored)
  const stateB = baseState();
  stateB.canUse = () => true;
  const resultB = await executeClaimedStudioRenderJob(createFakeService(stateB) as never, job);
  assert.ok(resultB.sizeBytes > 500);
  assert.ok(stateB.uploads.length > 0);

  // C: user_practices only → denied
  const stateC = baseState();
  stateC.canUse = () => false;
  let ffmpegC = 0;
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      createFakeService(stateC) as never,
      job,
      new AbortController().signal,
      1800,
      { renderToMp3: async () => { ffmpegC += 1; throw new Error("ffmpeg-should-not-run"); } },
    ),
    (error: unknown) =>
      error instanceof Error
      && (error as { code?: string }).code === CATALOG_MUSIC_UNAVAILABLE,
  );
  assert.equal(ffmpegC, 0);
  assert.equal(stateC.downloads.filter((item) => item.startsWith("practice-audio:")).length, 0);
  assert.equal(stateC.uploads.length, 0);

  // D: revoke after queue before execute
  const stateD = baseState();
  stateD.canUse = () => false;
  let ffmpegD = 0;
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      createFakeService(stateD) as never,
      job,
      new AbortController().signal,
      1800,
      { renderToMp3: async () => { ffmpegD += 1; throw new Error("ffmpeg-should-not-run"); } },
    ),
    (error: unknown) =>
      error instanceof Error
      && (error as { code?: string }).code === CATALOG_MUSIC_UNAVAILABLE,
  );
  assert.equal(ffmpegD, 0);
  assert.equal(stateD.uploads.length, 0);

  // E: OK at start, revoked before final upload
  const stateE = baseState();
  let canUseCount = 0;
  stateE.canUse = () => {
    canUseCount += 1;
    return canUseCount === 1;
  };
  await assert.rejects(
    () => executeClaimedStudioRenderJob(createFakeService(stateE) as never, job),
    (error: unknown) =>
      error instanceof Error
      && (error as { code?: string }).code === CATALOG_MUSIC_UNAVAILABLE,
  );
  assert.ok(stateE.downloads.includes(`practice-audio:${catalogAudioPath}`));
  assert.equal(stateE.uploads.length, 0);

  // F: unlisted/unpublished/listen_only + permanent entitlement still allowed
  const stateF = baseState();
  stateF.canUse = (userId) => userId === PRINCIPAL_ID;
  const resultF = await executeClaimedStudioRenderJob(createFakeService(stateF) as never, job);
  assert.ok(resultF.sizeBytes > 500);
  assert.ok(!stateF.queriedTables.includes("practices"));
  assert.ok(!stateF.queriedTables.includes("user_practices"));

  // G: missing audio_path
  const stateG = baseState();
  stateG.audioItems = [{ id: AUDIO_ID, practice_id: PRACTICE_ID, audio_path: "" }];
  let ffmpegG = 0;
  await assert.rejects(
    () => executeClaimedStudioRenderJob(
      createFakeService(stateG) as never,
      job,
      new AbortController().signal,
      1800,
      { renderToMp3: async () => { ffmpegG += 1; throw new Error("ffmpeg-should-not-run"); } },
    ),
    (error: unknown) =>
      error instanceof Error
      && (error as { code?: string }).code === CATALOG_MUSIC_UNAVAILABLE,
  );
  assert.equal(ffmpegG, 0);
  assert.equal(stateG.downloads.filter((item) => item.startsWith("practice-audio:")).length, 0);

  // H: temp source cleaned
  const leftover = (await listRenderWorkspaces()).filter((name) => !beforeWorkspaces.has(name));
  assert.deepEqual(leftover, []);

  const failCapture: {
    payload: { error_code?: string; error_message_safe?: string } | null;
  } = { payload: null };
  const failService = {
    from() {
      return {
        update(payload: { error_code?: string; error_message_safe?: string }) {
          failCapture.payload = payload;
          return this;
        },
        eq() { return this; },
        select() { return this; },
        async maybeSingle() { return { data: { id: "job-1" }, error: null }; },
      };
    },
  };
  const failed = await failClaimedStudioRenderJob(
    failService as never,
    job,
    new StudioCatalogMusicUnavailableError(),
  );
  assert.equal(failed, true);
  assert.equal(failCapture.payload?.error_code, CATALOG_MUSIC_UNAVAILABLE);
  assert.equal(failCapture.payload?.error_message_safe, CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE);

  const queueState = baseState();
  await authorizeCatalogAssetsForStudioRender({
    service: createFakeService(queueState) as never,
    projectId: PROJECT_ID,
    currentUserId: CURRENT_USER,
    hasProjectAccess: true,
    tracks: projectRow().project_data.tracks,
    assets: [uploadAsset(), catalogAsset()],
  });
  assert.ok(queueState.canUseCalls.some((call) => call.userId === PRINCIPAL_ID));
  assert.ok(!queueState.canUseCalls.some((call) => call.userId === CURRENT_USER));

  const legacyAssets = [uploadAsset(), catalogAsset({ catalog_access_user_id: null })];
  const adoptState = baseState();
  adoptState.assets = legacyAssets;
  adoptState.canUse = (userId) => userId === CURRENT_USER;
  await authorizeCatalogAssetsForStudioRender({
    service: createFakeService(adoptState) as never,
    projectId: PROJECT_ID,
    currentUserId: CURRENT_USER,
    hasProjectAccess: true,
    tracks: projectRow().project_data.tracks,
    assets: legacyAssets,
  });
  assert.equal(legacyAssets[1].catalog_access_user_id, CURRENT_USER);

  const deniedLegacy = [uploadAsset(), catalogAsset({ catalog_access_user_id: null })];
  await assert.rejects(
    () => authorizeCatalogAssetsForStudioRender({
      service: createFakeService(baseState()) as never,
      projectId: PROJECT_ID,
      currentUserId: CURRENT_USER,
      hasProjectAccess: true,
      tracks: projectRow().project_data.tracks,
      assets: deniedLegacy,
    }),
    (error: unknown) =>
      error instanceof Error
      && (error as { code?: string }).code === CATALOG_MUSIC_UNAVAILABLE,
  );
  assert.equal(deniedLegacy[1].catalog_access_user_id, null);

  await authorizeCatalogAssetsForStudioRender({
    service: createFakeService(baseState()) as never,
    projectId: PROJECT_ID,
    currentUserId: CURRENT_USER,
    hasProjectAccess: true,
    tracks: projectRow().project_data.tracks,
    assets: [uploadAsset(), catalogAsset({ catalog_access_user_id: PRINCIPAL_ID })],
  });

  const uploadOnly = createStudioRenderSnapshot({
    project: {
      ...projectRow(),
      project_data: {
        ...projectRow().project_data,
        tracks: [projectRow().project_data.tracks[0]],
        slots: [projectRow().project_data.slots[0]],
      },
    },
    expectedRevision: 3,
    assets: [uploadAsset()],
  });
  assert.equal(uploadOnly.assets.length, 1);
  if (uploadOnly.assets[0].sourceType === "upload" || uploadOnly.assets[0].sourceType === "recording") {
    assert.equal(uploadOnly.assets[0].storagePath, voiceStorage);
  }

  const publicFailPayload = {
    error_code: CATALOG_MUSIC_UNAVAILABLE,
    error_message_safe: CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE,
  };
  assert.doesNotMatch(JSON.stringify(publicFailPayload), /catalog_access_user_id|audio_path|entitlement/);

  const snapshotJson = JSON.stringify(snapshot);
  assert.doesNotMatch(snapshotJson, /user_practices/);
  assert.match(CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE, /недоступна для экспорта/);

  for (const name of await listRenderWorkspaces()) {
    if (!beforeWorkspaces.has(name)) {
      await rm(join(tmpdir(), name), { recursive: true, force: true });
    }
  }

  console.log("studio-catalog-music-render-unit: ok");
}

await main();
