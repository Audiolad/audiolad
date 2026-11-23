import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  STUDIO_RESUMABLE_MIN_BYTES,
  StudioTusNetworkError,
  type StudioTusRequest,
  type StudioTusResponse,
} from "../src/lib/studio/resumable-upload";
import {
  AUTHOR_AUDIO_UPLOAD_INTERRUPTED,
  hasAuthorAudioResumeSession,
  setAuthorAudioResumableUploadTestOverrides,
  uploadAuthorProductAudioDirect,
  type AuthorAudioUploadProgress,
} from "../src/lib/author-products/direct-audio-upload-client";
import {
  formatAuthorAudioUploadButtonLabel,
  formatAuthorAudioUploadLabel,
} from "../src/lib/author-products/audio-upload-progress-label";
import {
  COURSE_BUILDER_AUDIO_INTERRUPTED,
  getCourseBuilderAudioUploadError,
} from "../src/lib/author-products/course-builder-shared";
import { getAudioUploadErrorMessage } from "../src/lib/author-products/limits";

const BASE = "https://audiolad.test";
const TOKEN = "signed-token-not-logged";
const PRACTICE = "b6db179b-cc95-4641-930b-77291595dcc7";
const AUDIO = "34bc0a43-2362-4632-a2ba-cd6af513af34";

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

function tusResponse(status: number, headers: Record<string, string> = {}): StudioTusResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, header: (name) => lower[name.toLowerCase()] ?? null };
}

type Api = {
  calls: { url: string; body: Record<string, unknown> }[];
  starts: number;
  finalizes: number;
  abandons: string[];
  finalizeStatus: number;
};

function installFetch(api: Api) {
  let version = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    api.calls.push({ url, body });
    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/upload/start")) {
      api.starts += 1;
      version += 1;
      const path = `practices/${PRACTICE}/audio/${AUDIO}-v${version}.mp3`;
      return json(200, { upload_path: path, signedUpload: { path, token: TOKEN } });
    }
    if (url.endsWith("/upload/finalize")) {
      api.finalizes += 1;
      if (api.finalizeStatus !== 200) return json(api.finalizeStatus, { error: "upload_not_complete" });
      return json(200, {
        product: { audio_items: [{ id: AUDIO, audio_path: body.upload_path, duration_seconds: 600 }] },
      });
    }
    if (url.endsWith("/upload/abandon")) {
      api.abandons.push(String(body.upload_path));
      return json(200, { ok: true });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

function fakeTus(options: { failPatches?: Set<number>; partial?: boolean } = {}) {
  const uploads = new Map<string, { offset: number; length: number; object: string }>();
  const requests: StudioTusRequest[] = [];
  let patchCount = 0;
  let ids = 0;
  const transport = async (request: StudioTusRequest): Promise<StudioTusResponse> => {
    requests.push(request);
    assert.equal(request.headers["x-signature"], TOKEN);
    if (request.method === "POST") {
      const meta = request.headers["Upload-Metadata"] ?? "";
      const bucketPart = meta.split(",").find((part) => part.startsWith("bucketName "));
      assert.equal(Buffer.from(bucketPart!.split(" ")[1]!, "base64").toString(), "practice-audio");
      const objectPart = meta.split(",").find((part) => part.startsWith("objectName "));
      const object = Buffer.from(objectPart!.split(" ")[1]!, "base64").toString();
      ids += 1;
      const id = `up${ids}`;
      uploads.set(id, { offset: 0, length: Number(request.headers["Upload-Length"]), object });
      return tusResponse(201, { Location: `http://localhost:8000/storage/v1/upload/resumable/sign/${id}` });
    }
    const id = request.url.split("/").pop()!;
    const upload = uploads.get(id);
    if (!upload) return tusResponse(404);
    if (request.method === "HEAD") {
      return tusResponse(200, { "Upload-Offset": String(upload.offset), "Upload-Length": String(upload.length) });
    }
    if (request.method === "PATCH") {
      patchCount += 1;
      if (Number(request.headers["Upload-Offset"]) !== upload.offset) return tusResponse(409);
      const bytes = new Uint8Array(await request.body!.arrayBuffer());
      if (options.failPatches?.has(patchCount)) {
        const partial = options.partial === false ? 0 : Math.floor(bytes.length / 2);
        upload.offset += partial;
        request.onUploadProgress?.(partial);
        throw new StudioTusNetworkError("network");
      }
      request.onUploadProgress?.(bytes.length);
      upload.offset += bytes.length;
      return tusResponse(204, { "Upload-Offset": String(upload.offset) });
    }
    throw new Error(`unexpected ${request.method}`);
  };
  return { transport, uploads, requests };
}

const CHUNK = 1024;
const SIZE = Math.max(STUDIO_RESUMABLE_MIN_BYTES, 6 * 1024 * 1024) + 512;

function makeFile(name = "lesson.mp3", lastModified = 1000) {
  return new File([new Uint8Array(SIZE)], name, { type: "audio/mpeg", lastModified });
}

function setup(failPatches?: Set<number>, retryDelaysMs: number[] = [1, 1], partial = true) {
  const api: Api = { calls: [], starts: 0, finalizes: 0, abandons: [], finalizeStatus: 200 };
  installFetch(api);
  const tus = fakeTus({ failPatches, partial });
  const store = new MemoryStore();
  setAuthorAudioResumableUploadTestOverrides({
    supabaseUrl: BASE,
    transport: tus.transport,
    store,
    chunkBytes: CHUNK * 1024,
    retryDelaysMs,
    sleep: async () => {},
    waitForOnline: async () => {},
  });
  return { api, tus, store };
}

// 1. Happy path: TUS to practice-audio, progress grows, 100% only after finalize.
{
  const { api, tus, store } = setup();
  const progress: AuthorAudioUploadProgress[] = [];
  const result = await uploadAuthorProductAudioDirect({
    practiceId: PRACTICE,
    audioId: AUDIO,
    file: makeFile(),
    onProgress: (item) => progress.push(item),
  });
  assert.equal(result.ok, true);
  assert.equal(api.starts, 1);
  assert.equal(api.finalizes, 1);
  assert.deepEqual(api.abandons, []);
  assert.ok(tus.requests.some((request) => request.method === "PATCH"));
  const percents = progress.map((item) => item.percent);
  for (let index = 1; index < percents.length; index += 1) {
    assert.ok(percents[index]! >= percents[index - 1]!, "progress never goes back");
  }
  assert.ok(progress.slice(0, -1).every((item) => item.percent <= 99));
  assert.equal(progress.at(-1)?.percent, 100);
  assert.ok(progress.some((item) => item.phase === "finalizing" && item.percent === 99));
  assert.equal(store.length, 0, "finished upload leaves nothing in localStorage");
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 2. Drop mid-file, auto-retry continues from the confirmed offset.
{
  const { api, tus } = setup(new Set([2]), [1, 1, 1]);
  const progress: AuthorAudioUploadProgress[] = [];
  const result = await uploadAuthorProductAudioDirect({
    practiceId: PRACTICE,
    audioId: AUDIO,
    file: makeFile(),
    onProgress: (item) => progress.push(item),
  });
  assert.equal(result.ok, true);
  assert.equal(api.starts, 1);
  assert.ok(progress.some((item) => item.phase === "reconnecting"));
  assert.ok(tus.requests.some((request) => request.method === "HEAD"), "resync via HEAD");
  const upload = [...tus.uploads.values()][0]!;
  assert.equal(upload.offset, SIZE);
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 3. Retries exhausted → interrupted, no abandon, the same file resumes
//    without a new start; tokens never land in localStorage.
{
  const fails = new Set([2, 3, 4]);
  const { api, tus, store } = setup(fails, [1, 1], false);
  const file = makeFile();
  const first = await uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file });
  assert.equal(first.ok, false);
  assert.equal(!first.ok && first.error, AUTHOR_AUDIO_UPLOAD_INTERRUPTED);
  assert.deepEqual(api.abandons, [], "interrupted upload keeps its object path");
  assert.equal(hasAuthorAudioResumeSession({ practiceId: PRACTICE, audioId: AUDIO, file }), true);
  for (const key of store.map.keys()) {
    assert.doesNotMatch(store.map.get(key)!, new RegExp(TOKEN));
  }
  const offsetBefore = [...tus.uploads.values()][0]!.offset;
  assert.ok(offsetBefore > 0);
  fails.clear();
  const second = await uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file });
  assert.equal(second.ok, true);
  assert.equal(api.starts, 1, "retry reuses the signed upload");
  assert.equal(tus.uploads.size, 1, "retry resumes the same TUS upload");
  const firstResumePatch = tus.requests.filter((request) => request.method === "PATCH").at(-1);
  assert.ok(firstResumePatch);
  assert.equal(hasAuthorAudioResumeSession({ practiceId: PRACTICE, audioId: AUDIO, file }), false);
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 4. A different file drops the interrupted session (best-effort abandon).
{
  const fails = new Set([1, 2, 3]);
  const { api } = setup(fails, [1, 1], false);
  const first = await uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file: makeFile("a.mp3") });
  assert.equal(!first.ok && first.error, AUTHOR_AUDIO_UPLOAD_INTERRUPTED);
  fails.clear();
  const other = await uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file: makeFile("b.mp3", 2000) });
  assert.equal(other.ok, true);
  assert.equal(api.starts, 2);
  assert.equal(api.abandons.length, 1);
  assert.match(api.abandons[0]!, /-v1\.mp3$/);
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 5. Finalize rejected → guarded abandon, no session kept.
{
  const { api } = setup();
  api.finalizeStatus = 409;
  const file = makeFile();
  const result = await uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file });
  assert.equal(result.ok, false);
  assert.equal(api.abandons.length, 1);
  assert.equal(hasAuthorAudioResumeSession({ practiceId: PRACTICE, audioId: AUDIO, file }), false);
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 6. Parallel second upload of the same audio is refused.
{
  setup();
  const file = makeFile();
  const [a, b] = await Promise.all([
    uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file }),
    uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file }),
  ]);
  assert.equal(a.ok, true);
  assert.equal(!b.ok && b.error, "upload_in_progress");
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 6a. An aborted upload does not block the next one for the same audio.
{
  setup();
  const controller = new AbortController();
  const first = uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file: makeFile("x.mp3"), signal: controller.signal });
  controller.abort();
  const second = await uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file: makeFile("y.mp3", 3000) });
  await first.catch(() => null);
  assert.equal(second.ok, true);
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 6b. Network error on /upload/start resolves (never rejects) as upload_network.
{
  setup();
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  const result = await uploadAuthorProductAudioDirect({ practiceId: PRACTICE, audioId: AUDIO, file: makeFile() });
  assert.equal(!result.ok && result.error, "upload_network");
  setAuthorAudioResumableUploadTestOverrides(null);
}

// 7. Russian labels, en dash only.
const labels = [
  formatAuthorAudioUploadLabel(null),
  formatAuthorAudioUploadLabel({ phase: "uploading", uploadedBytes: 1, totalBytes: 2, percent: 45, retryInSeconds: null }),
  formatAuthorAudioUploadLabel({ phase: "reconnecting", uploadedBytes: 1, totalBytes: 2, percent: 45, retryInSeconds: 4 }),
  formatAuthorAudioUploadLabel({ phase: "reconnecting", uploadedBytes: 1, totalBytes: 2, percent: 45, retryInSeconds: 0 }),
  formatAuthorAudioUploadLabel({ phase: "finalizing", uploadedBytes: 2, totalBytes: 2, percent: 99, retryInSeconds: null }),
  formatAuthorAudioUploadButtonLabel({ phase: "uploading", uploadedBytes: 1, totalBytes: 2, percent: 45, retryInSeconds: null }),
  COURSE_BUILDER_AUDIO_INTERRUPTED,
  getAudioUploadErrorMessage("upload_interrupted", 0),
  getAudioUploadErrorMessage("upload_network", 0),
];
assert.equal(labels[1], "Загрузка аудио… 45%");
assert.equal(labels[2], "Связь прервалась – повторим через 4 с (45%)");
assert.equal(labels[3], "Восстанавливаем связь… 45%");
assert.equal(labels[4], "Проверяем аудио…");
assert.equal(labels[5], "Загрузка… 45%");
assert.equal(getCourseBuilderAudioUploadError("upload_interrupted", 0), COURSE_BUILDER_AUDIO_INTERRUPTED);
for (const label of labels) assert.doesNotMatch(label, /—/);

// 8. Wiring: course builder shows progress, retry and leave warning.
const builder = await readFile("src/components/author-dashboard/AuthorCourseBuilder.tsx", "utf8");
assert.match(builder, /formatAuthorAudioUploadLabel/);
assert.match(builder, /COURSE_BUILDER_AUDIO_RETRY_LABEL/);
assert.match(builder, /beforeunload/);
assert.match(builder, /AUTHOR_AUDIO_UPLOAD_INTERRUPTED/);
assert.match(builder, /catch \{\s*result = \{ ok: false, error: AUTHOR_AUDIO_UPLOAD_NETWORK/);
const form = await readFile("src/components/author-dashboard/AuthorProductForm.tsx", "utf8");
assert.match(form, /onProgress: setUploadingAudioProgress/);

console.log("author-audio-resumable-upload-unit: ok");
