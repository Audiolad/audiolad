/**
 * Resumable (TUS 1.0.0) upload of a Studio audio file to Supabase Storage
 * through a signed upload token (`/storage/v1/upload/resumable/sign`).
 *
 * The file is sent in chunks. After a network drop the client asks the
 * server for the confirmed offset (HEAD) and continues from there, with
 * backoff between attempts. The upload URL is remembered in localStorage by
 * storage path, so a later attempt for the same reserved asset (the
 * «Повторить» button or a page reload with the same file) resumes instead of
 * starting from zero. No tokens are written to storage or logs.
 */

export const STUDIO_RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024;
/** Files smaller than one chunk keep the single signed PUT. */
export const STUDIO_RESUMABLE_MIN_BYTES = STUDIO_RESUMABLE_CHUNK_BYTES;
export const STUDIO_RESUMABLE_RETRY_DELAYS_MS: readonly number[] = [
  1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000, 30_000, 30_000,
];
/** A chunk with no upload progress for this long is aborted and retried. */
export const STUDIO_RESUMABLE_STALL_TIMEOUT_MS = 60_000;
/** POST/HEAD without any answer for this long are aborted and retried. */
export const STUDIO_RESUMABLE_REQUEST_TIMEOUT_MS = 30_000;
/** Stored upload URLs older than this are ignored (signed tokens live 2 h). */
export const STUDIO_RESUMABLE_STORE_TTL_MS = 100 * 60 * 1000;

const STORE_PREFIX = "audiolad:studio-tus:v1:";
const TUS_VERSION = "1.0.0";

export type StudioResumableUploadErrorKind =
  | "network"
  | "unsupported"
  | "too_large"
  | "already_exists"
  | "rejected";

export class StudioResumableUploadError extends Error {
  constructor(
    readonly kind: StudioResumableUploadErrorKind,
    readonly status: number | null = null,
  ) {
    super(`studio_resumable_upload_${kind}`);
    this.name = "StudioResumableUploadError";
  }
}

export class StudioTusNetworkError extends Error {
  constructor(readonly reason: "network" | "stalled" = "network") {
    super(`studio_tus_${reason}`);
    this.name = "StudioTusNetworkError";
  }
}

export type StudioTusResponse = {
  status: number;
  header(name: string): string | null;
};

export type StudioTusRequest = {
  method: "POST" | "HEAD" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: Blob;
  signal: AbortSignal;
  onUploadProgress?: (loadedBytes: number) => void;
  stallTimeoutMs?: number;
};

/** Resolves with the HTTP response, rejects with StudioTusNetworkError or AbortError. */
export type StudioTusTransport = (request: StudioTusRequest) => Promise<StudioTusResponse>;

export type StudioResumableProgress = {
  phase: "uploading" | "reconnecting";
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  retryInMs: number | null;
};

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  readonly length?: number;
  key?(index: number): string | null;
};

export type StudioResumableUploadOptions = {
  supabaseUrl: string;
  bucket: string;
  signedUpload: { path: string; token: string };
  file: Blob;
  contentType: string;
  signal?: AbortSignal;
  onProgress?: (progress: StudioResumableProgress) => void;
  transport?: StudioTusTransport;
  store?: KeyValueStore | null;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  waitForOnline?: (signal: AbortSignal) => Promise<void>;
  now?: () => number;
  chunkBytes?: number;
  retryDelaysMs?: readonly number[];
  stallTimeoutMs?: number;
  requestTimeoutMs?: number;
};

type StoredUpload = { id: string; size: number; savedAt: number };

function abortError(): DOMException {
  return new DOMException("The upload was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

/** Name-based checks survive duplicated module instances (tests, chunks). */
export function isStudioTusNetworkError(error: unknown): error is StudioTusNetworkError {
  return error instanceof Error && error.name === "StudioTusNetworkError";
}

export function isStudioResumableUploadError(error: unknown): error is StudioResumableUploadError {
  return (
    error instanceof Error &&
    error.name === "StudioResumableUploadError" &&
    typeof (error as { kind?: unknown }).kind === "string"
  );
}

export function isStudioAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function encodeMetadataValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildStudioTusMetadata(input: {
  bucket: string;
  objectName: string;
  contentType: string;
}): string {
  return [
    ["bucketName", input.bucket],
    ["objectName", input.objectName],
    ["contentType", input.contentType],
    ["cacheControl", "3600"],
  ]
    .map(([key, value]) => `${key} ${encodeMetadataValue(value)}`)
    .join(",");
}

/**
 * Storage builds Location from its own upstream host (http://localhost:8000
 * behind kong), so only the upload id is taken from it and the URL is
 * rebuilt on the public Supabase origin.
 */
export function studioTusUploadIdFromLocation(location: string | null): string | null {
  if (!location) return null;
  const withoutQuery = location.split(/[?#]/)[0] ?? "";
  const id = withoutQuery.replace(/\/+$/, "").split("/").pop() ?? "";
  if (!id || id.length > 1024 || !/^[A-Za-z0-9_\-=.%]+$/.test(id)) return null;
  return id;
}

export function studioTusEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/upload/resumable/sign`;
}

export function studioTusUploadUrl(supabaseUrl: string, id: string): string {
  return `${studioTusEndpoint(supabaseUrl)}/${id}`;
}

function storeKey(bucket: string, path: string): string {
  return `${STORE_PREFIX}${bucket}/${path.replace(/^\/+/, "")}`;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readStored(store: KeyValueStore | null, key: string): StoredUpload | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredUpload>;
    if (
      typeof value.id !== "string" ||
      typeof value.size !== "number" ||
      typeof value.savedAt !== "number"
    ) {
      return null;
    }
    return { id: value.id, size: value.size, savedAt: value.savedAt };
  } catch {
    return null;
  }
}

function writeStored(store: KeyValueStore | null, key: string, value: StoredUpload) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota: resume after reload is best effort.
  }
}

function removeStored(store: KeyValueStore | null, key: string) {
  try {
    store?.removeItem(key);
  } catch {
    // ignore
  }
}

/** Drops expired studio upload entries so localStorage does not grow. */
export function pruneStudioResumableStore(
  store: KeyValueStore | null = defaultStore(),
  now = Date.now(),
) {
  if (!store || typeof store.key !== "function" || typeof store.length !== "number") return;
  const expired: string[] = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key || !key.startsWith(STORE_PREFIX)) continue;
      const value = readStored(store, key);
      if (!value || now - value.savedAt > STUDIO_RESUMABLE_STORE_TTL_MS) expired.push(key);
    }
  } catch {
    return;
  }
  for (const key of expired) removeStored(store, key);
}

/** Forget the resumable upload for a storage path (after abandon/finish). */
export function forgetStudioResumableUpload(
  bucket: string,
  path: string,
  store: KeyValueStore | null = defaultStore(),
) {
  removeStored(store, storeKey(bucket, path));
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function defaultWaitForOnline(signal: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || typeof window === "undefined" || navigator.onLine !== false) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const done = () => {
      window.removeEventListener("online", onOnline);
      signal.removeEventListener("abort", onAbort);
    };
    const onOnline = () => {
      done();
      resolve();
    };
    const onAbort = () => {
      done();
      reject(abortError());
    };
    window.addEventListener("online", onOnline);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function xhrTransport(request: StudioTusRequest): Promise<StudioTusResponse> {
  return new Promise((resolve, reject) => {
    if (request.signal.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const armStall = () => {
      clearStall();
      if (!request.stallTimeoutMs) return;
      stallTimer = setTimeout(() => {
        finish(() => reject(new StudioTusNetworkError("stalled")));
        xhr.abort();
      }, request.stallTimeoutMs);
    };
    const onAbort = () => {
      finish(() => reject(abortError()));
      xhr.abort();
    };
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearStall();
      request.signal.removeEventListener("abort", onAbort);
      settle();
    };
    xhr.open(request.method, request.url, true);
    for (const [name, value] of Object.entries(request.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      armStall();
      request.onUploadProgress?.(event.loaded);
    };
    xhr.onload = () => {
      finish(() =>
        resolve({
          status: xhr.status,
          header: (name) => xhr.getResponseHeader(name),
        }),
      );
    };
    xhr.onerror = () => finish(() => reject(new StudioTusNetworkError("network")));
    xhr.ontimeout = () => finish(() => reject(new StudioTusNetworkError("stalled")));
    xhr.onabort = () => finish(() => reject(abortError()));
    request.signal.addEventListener("abort", onAbort, { once: true });
    armStall();
    xhr.send(request.body ?? null);
  });
}

async function fetchTransport(request: StudioTusRequest): Promise<StudioTusResponse> {
  let response: Response;
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  const timer = request.stallTimeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, request.stallTimeoutMs)
    : null;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw abortError();
    if (timedOut) throw new StudioTusNetworkError("stalled");
    if (isStudioAbortError(error)) throw abortError();
    throw new StudioTusNetworkError("network");
  } finally {
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
  }
  if (request.body) request.onUploadProgress?.(request.body.size);
  // Drain so keep-alive sockets are reused.
  await response.arrayBuffer().catch(() => undefined);
  return { status: response.status, header: (name) => response.headers.get(name) };
}

export function defaultStudioTusTransport(): StudioTusTransport {
  return typeof XMLHttpRequest !== "undefined" ? xhrTransport : fetchTransport;
}

function readOffset(response: StudioTusResponse): number | null {
  const raw = response.header("Upload-Offset");
  if (raw == null || !/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) ? value : null;
}

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 423 || status === 429 || status >= 500;
}

class RetryableTusFailure extends Error {
  constructor(readonly status: number | null) {
    super("studio_tus_retryable");
  }
}

class UploadGone extends Error {}

export async function uploadStudioFileResumable(
  options: StudioResumableUploadOptions,
): Promise<void> {
  const transport = options.transport ?? defaultStudioTusTransport();
  const store = options.store === undefined ? defaultStore() : options.store;
  const sleep = options.sleep ?? defaultSleep;
  const waitForOnline = options.waitForOnline ?? defaultWaitForOnline;
  const now = options.now ?? Date.now;
  const chunkBytes = Math.max(1, options.chunkBytes ?? STUDIO_RESUMABLE_CHUNK_BYTES);
  const retryDelays = options.retryDelaysMs ?? STUDIO_RESUMABLE_RETRY_DELAYS_MS;
  const stallTimeoutMs = options.stallTimeoutMs ?? STUDIO_RESUMABLE_STALL_TIMEOUT_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? STUDIO_RESUMABLE_REQUEST_TIMEOUT_MS;
  const signal = options.signal ?? new AbortController().signal;
  const { file, bucket } = options;
  const path = options.signedUpload.path.replace(/^\/+/, "");
  const token = options.signedUpload.token;
  const totalBytes = file.size;
  const key = storeKey(bucket, path);

  pruneStudioResumableStore(store, now());

  const report = (
    uploadedBytes: number,
    phase: StudioResumableProgress["phase"] = "uploading",
    retryInMs: number | null = null,
  ) => {
    const clamped = Math.max(0, Math.min(totalBytes, uploadedBytes));
    options.onProgress?.({
      phase,
      uploadedBytes: clamped,
      totalBytes,
      percent: totalBytes > 0 ? Math.floor((clamped / totalBytes) * 100) : 100,
      retryInMs,
    });
  };

  const baseHeaders = (): Record<string, string> => ({
    "Tus-Resumable": TUS_VERSION,
    "x-signature": token,
  });

  let uploadId: string | null = null;
  const stored = readStored(store, key);
  if (stored && stored.size === totalBytes && now() - stored.savedAt <= STUDIO_RESUMABLE_STORE_TTL_MS) {
    uploadId = stored.id;
  } else if (stored) {
    removeStored(store, key);
  }

  let offset = 0;
  let needsSync = uploadId !== null;
  let failures = 0;

  const create = async () => {
    const response = await transport({
      method: "POST",
      url: studioTusEndpoint(options.supabaseUrl),
      headers: {
        ...baseHeaders(),
        "Upload-Length": String(totalBytes),
        "Upload-Metadata": buildStudioTusMetadata({
          bucket,
          objectName: path,
          contentType: options.contentType,
        }),
        "x-upsert": "false",
      },
      signal,
      stallTimeoutMs: requestTimeoutMs,
    });
    if (response.status === 201) {
      const id = studioTusUploadIdFromLocation(response.header("Location"));
      if (!id) throw new StudioResumableUploadError("rejected", response.status);
      uploadId = id;
      offset = 0;
      needsSync = false;
      writeStored(store, key, { id, size: totalBytes, savedAt: now() });
      return;
    }
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      throw new StudioResumableUploadError("unsupported", response.status);
    }
    if (response.status === 413) throw new StudioResumableUploadError("too_large", 413);
    if (response.status === 409) throw new StudioResumableUploadError("already_exists", 409);
    if (isRetryableStatus(response.status)) throw new RetryableTusFailure(response.status);
    throw new StudioResumableUploadError("rejected", response.status);
  };

  const sync = async (id: string) => {
    const response = await transport({
      method: "HEAD",
      url: studioTusUploadUrl(options.supabaseUrl, id),
      headers: baseHeaders(),
      signal,
      stallTimeoutMs: requestTimeoutMs,
    });
    if (response.status === 200 || response.status === 204) {
      const serverOffset = readOffset(response);
      const length = response.header("Upload-Length");
      if (
        serverOffset == null ||
        serverOffset > totalBytes ||
        (length != null && length.trim() !== String(totalBytes))
      ) {
        throw new UploadGone();
      }
      // Bytes confirmed since the last attempt count as progress.
      if (serverOffset > offset) failures = 0;
      offset = serverOffset;
      needsSync = false;
      return;
    }
    if (isRetryableStatus(response.status)) throw new RetryableTusFailure(response.status);
    // 400/403/404/410: the stored upload is not usable any more.
    throw new UploadGone();
  };

  const patch = async (id: string) => {
    const end = Math.min(totalBytes, offset + chunkBytes);
    const startOffset = offset;
    const response = await transport({
      method: "PATCH",
      url: studioTusUploadUrl(options.supabaseUrl, id),
      headers: {
        ...baseHeaders(),
        "Upload-Offset": String(startOffset),
        "Content-Type": "application/offset+octet-stream",
      },
      body: file.slice(startOffset, end),
      signal,
      stallTimeoutMs,
      onUploadProgress: (loaded) => report(startOffset + Math.min(loaded, end - startOffset)),
    });
    if (response.status === 204 || response.status === 200) {
      const next = readOffset(response);
      if (next == null || next < startOffset || next > totalBytes) {
        needsSync = true;
        throw new RetryableTusFailure(response.status);
      }
      offset = next;
      if (next > startOffset) failures = 0;
      writeStored(store, key, { id, size: totalBytes, savedAt: now() });
      report(offset);
      return;
    }
    if (response.status === 409) {
      // Offset conflict: another attempt already moved the upload. Resync.
      needsSync = true;
      throw new RetryableTusFailure(409);
    }
    if (response.status === 404 || response.status === 410) throw new UploadGone();
    if (response.status === 413) throw new StudioResumableUploadError("too_large", 413);
    if (isRetryableStatus(response.status)) {
      needsSync = true;
      throw new RetryableTusFailure(response.status);
    }
    throw new StudioResumableUploadError("rejected", response.status);
  };

  report(0);
  let lastStatus: number | null = null;
  while (true) {
    throwIfAborted(signal);
    try {
      if (!uploadId) {
        await create();
      } else if (needsSync) {
        await sync(uploadId);
        report(offset);
      }
      if (uploadId && offset >= totalBytes) break;
      if (uploadId) await patch(uploadId);
      if (offset >= totalBytes) break;
      continue;
    } catch (error) {
      if (isStudioAbortError(error) || signal.aborted) throw abortError();
      if (isStudioResumableUploadError(error)) {
        if (error.kind !== "network") removeStored(store, key);
        throw error;
      }
      if (error instanceof UploadGone) {
        removeStored(store, key);
        uploadId = null;
        offset = 0;
        needsSync = false;
        failures += 1;
        if (failures > retryDelays.length) {
          throw new StudioResumableUploadError("network", lastStatus);
        }
        continue;
      }
      if (error instanceof RetryableTusFailure) {
        lastStatus = error.status;
      } else if (!isStudioTusNetworkError(error)) {
        throw error;
      }
      needsSync = uploadId !== null;
      if (failures >= retryDelays.length) {
        throw new StudioResumableUploadError("network", lastStatus);
      }
      const delay = retryDelays[failures] ?? retryDelays[retryDelays.length - 1] ?? 1000;
      failures += 1;
      report(offset, "reconnecting", delay);
      await waitForOnline(signal);
      await sleep(delay, signal);
      report(offset, "reconnecting", 0);
    }
  }
  removeStored(store, key);
  report(totalBytes);
}
