import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  STUDIO_RESUMABLE_MIN_BYTES,
  StudioResumableUploadError,
  StudioTusNetworkError,
  buildStudioTusMetadata,
  defaultStudioTusTransport,
  studioTusUploadIdFromLocation,
  uploadStudioFileResumable,
  type StudioResumableProgress,
  type StudioTusRequest,
  type StudioTusResponse,
} from "../src/lib/studio/resumable-upload";
import {
  StudioPersistenceClientError,
  retryStudioProjectAssetUpload,
  setStudioResumableUploadTestOverrides,
  uploadStudioProjectAsset,
} from "../src/lib/studio/persistence-client";
import {
  aggregateStudioAssetUploadProgress,
  formatStudioAssetUploadLabel,
} from "../src/lib/studio/upload-progress-label";

const BASE = "https://audiolad.test";
const BUCKET = "studio-draft-assets";
const TOKEN = "signed-token-not-logged";
const UPLOAD_ID = "c3R1ZGlvLWRyYWZ0LWFzc2V0cy9hL2IvYy52b2ljZS5tNGEvdjE";

class MemoryStore {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

function response(status: number, headers: Record<string, string> = {}): StudioTusResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, header: (name) => lower[name.toLowerCase()] ?? null };
}

type FakeServer = {
  requests: StudioTusRequest[];
  offset: number;
  length: number | null;
  exists: boolean;
  received: Uint8Array[];
};

function fakeTusServer(options: {
  failPatchAt?: Set<number>;
  partialOnFail?: number;
  createStatus?: number;
  location?: string;
  headStatus?: number;
  conflictOnce?: boolean;
} = {}) {
  const server: FakeServer = { requests: [], offset: 0, length: null, exists: false, received: [] };
  let patchCount = 0;
  let conflictUsed = false;
  const transport = async (request: StudioTusRequest): Promise<StudioTusResponse> => {
    server.requests.push(request);
    if (request.signal.aborted) throw new DOMException("aborted", "AbortError");
    assert.equal(request.headers["Tus-Resumable"], "1.0.0");
    assert.equal(request.headers["x-signature"], TOKEN);
    if (request.method === "POST") {
      assert.equal(request.url, `${BASE}/storage/v1/upload/resumable/sign`);
      if (options.createStatus && options.createStatus !== 201) return response(options.createStatus);
      server.exists = true;
      server.offset = 0;
      server.length = Number(request.headers["Upload-Length"]);
      return response(201, {
        Location: options.location ?? `http://localhost:8000/storage/v1/upload/resumable/sign/${UPLOAD_ID}`,
      });
    }
    assert.equal(request.url, `${BASE}/storage/v1/upload/resumable/sign/${UPLOAD_ID}`);
    if (request.method === "HEAD") {
      if (options.headStatus) return response(options.headStatus);
      if (!server.exists) return response(404);
      return response(200, { "Upload-Offset": String(server.offset), "Upload-Length": String(server.length) });
    }
    if (request.method === "PATCH") {
      patchCount += 1;
      assert.equal(request.headers["Content-Type"], "application/offset+octet-stream");
      if (options.conflictOnce && !conflictUsed) {
        conflictUsed = true;
        server.offset += 1;
        server.received.push(new Uint8Array([0]));
        return response(409);
      }
      if (Number(request.headers["Upload-Offset"]) !== server.offset) return response(409);
      const bytes = new Uint8Array(await request.body!.arrayBuffer());
      if (options.failPatchAt?.has(patchCount)) {
        const partial = Math.min(bytes.length, options.partialOnFail ?? 0);
        server.received.push(bytes.subarray(0, partial));
        server.offset += partial;
        request.onUploadProgress?.(partial);
        throw new StudioTusNetworkError("network");
      }
      request.onUploadProgress?.(bytes.length);
      server.received.push(bytes);
      server.offset += bytes.length;
      return response(204, { "Upload-Offset": String(server.offset) });
    }
    throw new Error(`unexpected ${request.method}`);
  };
  return { server, transport };
}

function joined(parts: Uint8Array[]): string {
  return Buffer.concat(parts.map((part) => Buffer.from(part))).toString("utf8");
}

const content = "0123456789abcdefghijklmnopqrstuvwxyzABCDE"; // 41 bytes
const file = new Blob([content], { type: "audio/mp4" });
const signedUpload = { path: "author/u/p/a/voice.m4a", token: TOKEN };
const sleeps: number[] = [];
const sleep = async (ms: number) => {
  sleeps.push(ms);
};
const online = async () => undefined;

// Metadata and Location parsing.
{
  const meta = buildStudioTusMetadata({ bucket: BUCKET, objectName: "a/Запись.m4a", contentType: "audio/mp4" });
  const decoded = Object.fromEntries(
    meta.split(",").map((pair) => {
      const [key, value] = pair.split(" ");
      return [key, Buffer.from(value!, "base64").toString("utf8")];
    }),
  );
  assert.deepEqual(decoded, {
    bucketName: BUCKET,
    objectName: "a/Запись.m4a",
    contentType: "audio/mp4",
    cacheControl: "3600",
  });
  assert.equal(
    studioTusUploadIdFromLocation(`http://localhost:8000/storage/v1/upload/resumable/sign/${UPLOAD_ID}`),
    UPLOAD_ID,
  );
  assert.equal(studioTusUploadIdFromLocation(null), null);
  assert.equal(studioTusUploadIdFromLocation("http://x/sign/<script>"), null);
}

// 1. Fresh upload in chunks; Location host is rewritten to the public origin.
{
  const store = new MemoryStore();
  const { server, transport } = fakeTusServer();
  const progress: StudioResumableProgress[] = [];
  await uploadStudioFileResumable({
    supabaseUrl: `${BASE}/`,
    bucket: BUCKET,
    signedUpload,
    file,
    contentType: "audio/mp4",
    transport,
    store,
    sleep,
    waitForOnline: online,
    chunkBytes: 10,
    onProgress: (item) => progress.push(item),
  });
  assert.equal(joined(server.received), content);
  const create = server.requests[0]!;
  assert.equal(create.method, "POST");
  assert.equal(create.headers["Upload-Length"], "41");
  assert.equal(create.headers["x-upsert"], "false");
  assert.equal(server.requests.filter((r) => r.method === "PATCH").length, 5);
  assert.equal(progress.at(-1)?.percent, 100);
  for (let i = 1; i < progress.length; i += 1) {
    assert(progress[i]!.uploadedBytes >= progress[i - 1]!.uploadedBytes, "progress is monotonic");
  }
  assert.equal(store.map.size, 0, "store cleared after success");
  for (const value of store.map.values()) assert(!value.includes(TOKEN));
}

// 2. Network drop mid-chunk: HEAD resync, continue from confirmed offset, backoff.
{
  sleeps.length = 0;
  const store = new MemoryStore();
  const { server, transport } = fakeTusServer({ failPatchAt: new Set([2, 3]), partialOnFail: 4 });
  const phases: string[] = [];
  let storedDuringUpload = "";
  await uploadStudioFileResumable({
    supabaseUrl: BASE,
    bucket: BUCKET,
    signedUpload,
    file,
    contentType: "audio/mp4",
    transport,
    store,
    sleep,
    waitForOnline: online,
    chunkBytes: 10,
    onProgress: (item) => {
      phases.push(item.phase);
      if (store.map.size) storedDuringUpload = [...store.map.values()][0]!;
    },
  });
  assert.equal(joined(server.received), content, "bytes arrive exactly once and in order");
  // Partial bytes were confirmed between drops, so backoff restarts.
  assert.deepEqual(sleeps, [1000, 1000]);
  assert(phases.includes("reconnecting"));
  assert(server.requests.some((r) => r.method === "HEAD"));
  assert(storedDuringUpload.includes(UPLOAD_ID));
  assert(!storedDuringUpload.includes(TOKEN), "token is never stored");
}

// 3. Resume from a stored upload (e.g. «Повторить» or reload): no new POST.
{
  const store = new MemoryStore();
  const first = fakeTusServer({ failPatchAt: new Set([2, 3, 4]), partialOnFail: 0 });
  await assert.rejects(
    uploadStudioFileResumable({
      supabaseUrl: BASE,
      bucket: BUCKET,
      signedUpload,
      file,
      contentType: "audio/mp4",
      transport: first.transport,
      store,
      sleep,
      waitForOnline: online,
      chunkBytes: 10,
      retryDelaysMs: [5, 5],
    }),
    (error: unknown) => error instanceof StudioResumableUploadError && error.kind === "network",
  );
  assert.equal(first.server.offset, 10);
  assert.equal(store.map.size, 1, "upload remembered for resume");
  const { server: second, transport } = fakeTusServer();
  second.exists = true;
  second.offset = first.server.offset;
  second.length = 41;
  second.received = [...first.server.received];
  await uploadStudioFileResumable({
    supabaseUrl: BASE,
    bucket: BUCKET,
    signedUpload: { ...signedUpload },
    file,
    contentType: "audio/mp4",
    transport,
    store,
    sleep,
    waitForOnline: online,
    chunkBytes: 10,
  });
  assert.equal(second.requests[0]!.method, "HEAD");
  assert(!second.requests.some((r) => r.method === "POST"));
  assert.equal(joined(second.received), content);
  assert.equal(store.map.size, 0);
}

// 4. Stored upload expired on the server (404) -> start a new one.
{
  const store = new MemoryStore();
  store.setItem(
    `audiolad:studio-tus:v1:${BUCKET}/${signedUpload.path}`,
    JSON.stringify({ id: UPLOAD_ID, size: 41, savedAt: Date.now() }),
  );
  const { server, transport } = fakeTusServer();
  await uploadStudioFileResumable({
    supabaseUrl: BASE, bucket: BUCKET, signedUpload, file, contentType: "audio/mp4",
    transport, store, sleep, waitForOnline: online, chunkBytes: 100,
  });
  assert.deepEqual(server.requests.map((r) => r.method), ["HEAD", "POST", "PATCH"]);
  assert.equal(joined(server.received), content);
}

// 5. Offset conflict (409) -> resync with HEAD, no data duplication.
{
  sleeps.length = 0;
  const { server, transport } = fakeTusServer({ conflictOnce: true });
  await uploadStudioFileResumable({
    supabaseUrl: BASE, bucket: BUCKET, signedUpload, file, contentType: "audio/mp4",
    transport, store: new MemoryStore(), sleep, waitForOnline: online, chunkBytes: 50,
  });
  assert.equal(server.offset, 41);
  assert(server.requests.some((r) => r.method === "HEAD"));
}

// 6. Server without TUS -> "unsupported"; 413 -> too_large; other 4xx -> rejected.
for (const [status, kind] of [[404, "unsupported"], [413, "too_large"], [400, "rejected"], [409, "already_exists"]] as const) {
  const { transport } = fakeTusServer({ createStatus: status });
  await assert.rejects(
    uploadStudioFileResumable({
      supabaseUrl: BASE, bucket: BUCKET, signedUpload, file, contentType: "audio/mp4",
      transport, store: new MemoryStore(), sleep, waitForOnline: online,
    }),
    (error: unknown) => error instanceof StudioResumableUploadError && error.kind === kind,
  );
}

// 7. 5xx on create is retried with backoff.
{
  sleeps.length = 0;
  let calls = 0;
  const { server, transport } = fakeTusServer();
  await uploadStudioFileResumable({
    supabaseUrl: BASE, bucket: BUCKET, signedUpload, file, contentType: "audio/mp4",
    transport: async (request) => {
      if (request.method === "POST" && calls++ === 0) return response(502);
      return transport(request);
    },
    store: new MemoryStore(), sleep, waitForOnline: online,
  });
  assert.deepEqual(sleeps, [1000]);
  assert.equal(server.offset, 41);
}

// 8. Abort stops immediately with AbortError.
{
  const controller = new AbortController();
  const { server, transport } = fakeTusServer();
  await assert.rejects(
    uploadStudioFileResumable({
      supabaseUrl: BASE, bucket: BUCKET, signedUpload, file, contentType: "audio/mp4",
      transport: async (request) => {
        const result = await transport(request);
        if (request.method === "PATCH") controller.abort();
        return result;
      },
      signal: controller.signal,
      store: new MemoryStore(), sleep, waitForOnline: online, chunkBytes: 10,
    }),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(server.requests.filter((r) => r.method === "PATCH").length, 1);
}

// 8b. POST/HEAD carry a timeout; a hung HEAD is aborted and retried, not stuck forever.
{
  const store = new MemoryStore();
  store.setItem(
    `audiolad:studio-tus:v1:${BUCKET}/${signedUpload.path}`,
    JSON.stringify({ id: UPLOAD_ID, size: 41, savedAt: Date.now() }),
  );
  const { server, transport } = fakeTusServer();
  server.exists = true;
  server.length = 41;
  let hung = 0;
  const seenTimeouts: Array<[string, number | undefined]> = [];
  await uploadStudioFileResumable({
    supabaseUrl: BASE, bucket: BUCKET, signedUpload, file, contentType: "audio/mp4",
    store, sleep, waitForOnline: online, chunkBytes: 100, requestTimeoutMs: 20,
    transport: async (request) => {
      seenTimeouts.push([request.method, request.stallTimeoutMs]);
      if (request.method === "HEAD" && hung++ === 0) {
        // Simulate a request that never answers: the transport's own timeout fires.
        assert.equal(request.stallTimeoutMs, 20);
        throw new StudioTusNetworkError("stalled");
      }
      return transport(request);
    },
  });
  assert.equal(server.offset, 41);
  assert(seenTimeouts.filter(([m]) => m === "HEAD").every(([, t]) => t === 20));
  assert(seenTimeouts.filter(([m]) => m === "PATCH").every(([, t]) => typeof t === "number" && t > 0));
}

// 8c. The fetch transport enforces the timeout itself.
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  try {
    const transport = defaultStudioTusTransport();
    await assert.rejects(
      transport({
        method: "HEAD",
        url: `${BASE}/x`,
        headers: {},
        signal: new AbortController().signal,
        stallTimeoutMs: 30,
      }),
      (error: unknown) => error instanceof Error && error.name === "StudioTusNetworkError",
    );
    const controller = new AbortController();
    const pending = transport({ method: "HEAD", url: `${BASE}/x`, headers: {}, signal: controller.signal, stallTimeoutMs: 5_000 });
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 9. Labels: Russian, en dash only.
{
  assert.equal(formatStudioAssetUploadLabel(null), "Сохранение аудио…");
  assert.equal(
    formatStudioAssetUploadLabel({ phase: "uploading", uploadedBytes: 37, totalBytes: 100, percent: 37, retryInSeconds: null }),
    "Сохранение аудио… 37%",
  );
  const reconnect = formatStudioAssetUploadLabel({ phase: "reconnecting", uploadedBytes: 40, totalBytes: 100, percent: 40, retryInSeconds: 8 });
  assert.equal(reconnect, "Связь прервалась – повторим через 8 с (40%)");
  assert.equal(
    formatStudioAssetUploadLabel({ phase: "reconnecting", uploadedBytes: 40, totalBytes: 100, percent: 40, retryInSeconds: 0 }),
    "Восстанавливаем связь… 40%",
  );
  assert.equal(
    formatStudioAssetUploadLabel({ phase: "finalizing", uploadedBytes: 1, totalBytes: 1, percent: 99, retryInSeconds: null }),
    "Проверяем аудио…",
  );
  const agg = aggregateStudioAssetUploadProgress([
    { phase: "uploading", uploadedBytes: 50, totalBytes: 100, percent: 50, retryInSeconds: null },
    { phase: "uploading", uploadedBytes: 0, totalBytes: 100, percent: 0, retryInSeconds: null },
  ]);
  assert.equal(agg?.percent, 25);
  assert.equal(aggregateStudioAssetUploadProgress([]), null);
  const sources = await Promise.all([
    readFile("src/lib/studio/upload-progress-label.ts", "utf8"),
    readFile("src/lib/studio/resumable-upload.ts", "utf8"),
  ]);
  for (const source of sources) assert(!source.includes("\u2014"), "no em dash");
}

// 10. persistence-client: large file goes through TUS, small file keeps the single PUT,
//     and a re-picked file resumes its earlier reservation.
{
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  const projectId = "11111111-1111-4111-8111-111111111111";
  const assetId = "22222222-2222-4222-8222-222222222222";
  const big = new File([new Uint8Array(STUDIO_RESUMABLE_MIN_BYTES + 5)], "voice.m4a", {
    type: "audio/mp4",
    lastModified: 1_700_000_000_000,
  });
  const assetDto = {
    id: assetId,
    projectId,
    originalName: "voice.m4a",
    mimeType: "audio/mp4",
    sizeBytes: big.size,
    durationSeconds: null,
    sourceType: "upload",
    createdAt: "2026-11-23T00:00:00.000Z",
  };
  const store = new MemoryStore();
  let tusMode: "fail" | "ok" = "fail";
  const tusRequests: string[] = [];
  let serverOffset = 0;
  setStudioResumableUploadTestOverrides({
    store,
    sleep: async () => undefined,
    waitForOnline: online,
    retryDelaysMs: [1, 1],
    chunkBytes: 4 * 1024 * 1024,
    transport: async (request) => {
      tusRequests.push(request.method);
      if (request.method === "POST") return response(201, { Location: `http://localhost:8000/x/${UPLOAD_ID}` });
      if (request.method === "HEAD") return response(200, { "Upload-Offset": String(serverOffset), "Upload-Length": String(big.size) });
      if (tusMode === "fail" && serverOffset > 0) throw new StudioTusNetworkError("network");
      serverOffset += request.body!.size;
      return response(204, { "Upload-Offset": String(serverOffset) });
    },
  });
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push(`${init?.method ?? "GET"} ${href.replace(BASE, "")}`);
    if (href === `/api/studio/projects/${projectId}/assets`) {
      return Response.json({ asset: assetDto, signedUpload: { path: "a/b/voice.m4a", token: TOKEN } }, { status: 201 });
    }
    if (href.endsWith("/retry")) {
      return Response.json({ asset: assetDto, signedUpload: { path: "a/b/voice.m4a", token: TOKEN }, alreadyUploaded: false });
    }
    if (href.endsWith("/finalize")) {
      if (serverOffset < big.size) return Response.json({ error: "upload_not_complete" }, { status: 409 });
      return Response.json({ asset: { ...assetDto, durationSeconds: 60 } });
    }
    if (href.includes("/storage/v1/object/upload/sign/")) return new Response(null, { status: 200 });
    throw new Error(`unexpected fetch ${href}`);
  }) as typeof fetch;
  try {
    const progress: string[] = [];
    await assert.rejects(
      uploadStudioProjectAsset({ projectId, file: big, sourceType: "upload", onProgress: (p) => progress.push(p.phase) }),
      (error: unknown) => error instanceof StudioPersistenceClientError && error.code === "upload_interrupted",
    );
    const interrupted = new StudioPersistenceClientError("upload_interrupted").message;
    assert(interrupted.includes("–") && !interrupted.includes("\u2014"));
    assert(progress.includes("reconnecting"));
    // Server still unreachable during the reconcile finalize: keep upload_interrupted.
    const savedFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/finalize")) throw new TypeError("Failed to fetch");
      return savedFetch(url, init);
    }) as typeof fetch;
    try {
      await assert.rejects(
        uploadStudioProjectAsset({ projectId, file: big, sourceType: "upload" }),
        (error: unknown) => error instanceof StudioPersistenceClientError && error.code === "upload_interrupted",
      );
    } finally {
      globalThis.fetch = savedFetch;
    }
    assert(!calls.some((c) => c.includes("/storage/v1/object/upload/sign/")), "large file does not use single PUT");
    // Page reload: same file picked again -> resume the same reservation, no new reserve.
    tusMode = "ok";
    calls.length = 0;
    tusRequests.length = 0;
    const reserved: string[] = [];
    const asset = await uploadStudioProjectAsset({
      projectId,
      file: big,
      sourceType: "upload",
      onReserved: (id) => reserved.push(id),
    });
    assert.equal(asset.id, assetId);
    assert.deepEqual(reserved, [assetId]);
    assert(calls.some((c) => c.endsWith("/retry")));
    assert(!calls.includes(`POST /api/studio/projects/${projectId}/assets`), "no duplicate reservation");
    assert.equal(tusRequests[0], "HEAD", "resumes stored upload");
    assert(!tusRequests.includes("POST"));
    assert.equal(store.map.size, 0, "resume entries cleared after success");

    // «Повторить» path uses the same resumable machinery.
    serverOffset = 0;
    const retried = await retryStudioProjectAssetUpload({ projectId, assetId, file: big });
    assert.equal(retried.id, assetId);

    // Small files keep the single signed PUT.
    calls.length = 0;
    const small = new File([new Uint8Array(10)], "voice.m4a", { type: "audio/mp4" });
    serverOffset = big.size;
    await uploadStudioProjectAsset({ projectId, file: small, sourceType: "upload" });
    assert(calls.some((c) => c.startsWith("PUT /storage/v1/object/upload/sign/")));
  } finally {
    globalThis.fetch = originalFetch;
    setStudioResumableUploadTestOverrides(null);
  }
}

// 11. UI wiring contracts.
{
  const shell = await readFile("src/components/studio/StudioEditorShell.tsx", "utf8");
  assert(shell.includes("formatStudioAssetUploadLabel(assetUploadProgress[track.id])"));
  assert(shell.includes("shouldWarnBeforeLeaving"));
  assert(shell.includes("Аудио ещё загружается. Если выйти сейчас, загрузка прервётся."));
  const provider = await readFile("src/components/studio/StudioAudioProvider.tsx", "utf8");
  assert.equal((provider.match(/onProgress: \(progress\) =>/g) ?? []).length, 2);
}

console.log("studio resumable upload checks passed");
