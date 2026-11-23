import {
  PRACTICE_AUDIO_BUCKET,
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
  canonicalProductAudioUploadMime,
  detectProductAudioSourceFormat,
  validateProductAudioFileClient,
} from "@/lib/author-products/product-audio-upload-contract";
import {
  classifyAuthorSignedUploadError,
  fileForSignedAuthorAudioUpload,
  type AuthorSignedUploadErrorReport,
} from "@/lib/author-products/signed-upload-client";
import type { AuthorProductDetail } from "@/lib/author-products/types";
import {
  STUDIO_RESUMABLE_MIN_BYTES,
  STUDIO_RESUMABLE_STORE_TTL_MS,
  forgetStudioResumableUpload,
  isStudioAbortError,
  isStudioResumableUploadError,
  uploadStudioFileResumable,
  type StudioResumableProgress,
  type StudioResumableUploadOptions,
} from "@/lib/studio/resumable-upload";
import { createClient } from "@/lib/supabase/client";

export type AuthorProductSignedUpload = {
  path: string;
  token: string;
};

export type AuthorProductAudioUploadSuccess = {
  ok: true;
  product: AuthorProductDetail;
};

export type AuthorProductAudioUploadFailure = {
  ok: false;
  error?: string;
  message?: string;
  status: number;
};

export type AuthorProductAudioUploadResult =
  | AuthorProductAudioUploadSuccess
  | AuthorProductAudioUploadFailure;

/**
 * Progress of one author audio upload. 100% is reported only after the
 * server has checked the file (finalize), so the bar never sits at 100%
 * while the file is still being processed.
 */
export type AuthorAudioUploadProgress = {
  phase: "uploading" | "reconnecting" | "finalizing";
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  retryInSeconds: number | null;
};

export type AuthorAudioUploadProgressHandler = (
  progress: AuthorAudioUploadProgress,
) => void;

/** Error code when the connection dropped and automatic retries ran out. */
export const AUTHOR_AUDIO_UPLOAD_INTERRUPTED = "upload_interrupted";
/** Error code when the server could not be reached (small file or finalize). */
export const AUTHOR_AUDIO_UPLOAD_NETWORK = "upload_network";

type StartPayload = {
  upload_path?: string;
  signedUpload?: AuthorProductSignedUpload;
  error?: string;
  message?: string;
};

type FinalizePayload = {
  product?: AuthorProductDetail;
  error?: string;
  message?: string;
};

function isSignedUpload(
  value: unknown,
): value is AuthorProductSignedUpload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      typeof value.path === "string" &&
      "token" in value &&
      typeof value.token === "string",
  );
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function abandonProductAudioUpload(input: {
  practiceId: string;
  audioId: string;
  uploadPath: string;
  storageError?: AuthorSignedUploadErrorReport;
}): Promise<void> {
  try {
    await fetch(
      `/api/author/products/${input.practiceId}/audio/${input.audioId}/upload/abandon`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_path: input.uploadPath,
          ...(input.storageError ? { storageError: input.storageError } : {}),
        }),
      },
    );
  } catch {
    // Best-effort cleanup of the unapplied versioned object.
  }
}

type ResumeSession = {
  key: string;
  practiceId: string;
  audioId: string;
  uploadPath: string;
  signedUpload: AuthorProductSignedUpload;
  createdAt: number;
};

/**
 * Interrupted uploads, by practice/audio/file. Kept only in memory (never in
 * storage): a repeat with the same file reuses the signed upload and TUS
 * resumes from the confirmed offset. Tokens never leave this map.
 */
const resumeSessions = new Map<string, ResumeSession>();
/** Audio ids with an upload in progress in this tab (value: its signal). */
const activeUploadAudioIds = new Map<string, { signal?: AbortSignal }>();

type ResumableTestOverrides = Partial<
  Pick<
    StudioResumableUploadOptions,
    "transport" | "sleep" | "waitForOnline" | "retryDelaysMs" | "store" | "chunkBytes" | "now"
  >
> & { supabaseUrl?: string; nowMs?: () => number };

let resumableTestOverrides: ResumableTestOverrides | null = null;

/** Test hook: route resumable uploads through a fake transport/timers. */
export function setAuthorAudioResumableUploadTestOverrides(
  overrides: ResumableTestOverrides | null,
) {
  resumableTestOverrides = overrides;
  if (!overrides) resumeSessions.clear();
}

function nowMs(): number {
  return resumableTestOverrides?.nowMs?.() ?? Date.now();
}

function fileResumeKey(practiceId: string, audioId: string, file: File): string {
  return [practiceId, audioId, file.name, file.size, file.lastModified].join("|");
}

function supabasePublicUrl(): string | null {
  const base =
    resumableTestOverrides?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? base.replace(/\/+$/, "") : null;
}

function forgetSession(session: ResumeSession) {
  resumeSessions.delete(session.key);
  forgetStudioResumableUpload(
    PRACTICE_AUDIO_BUCKET,
    session.signedUpload.path.replace(/^\/+/, ""),
    resumableTestOverrides?.store,
  );
}

/** Drops interrupted sessions of this audio that no longer match the file. */
async function discardOtherSessions(input: {
  practiceId: string;
  audioId: string;
  keepKey: string | null;
}) {
  const stale = [...resumeSessions.values()].filter(
    (session) =>
      session.practiceId === input.practiceId &&
      session.audioId === input.audioId &&
      (session.key !== input.keepKey ||
        nowMs() - session.createdAt > STUDIO_RESUMABLE_STORE_TTL_MS),
  );
  for (const session of stale) {
    forgetSession(session);
    await abandonProductAudioUpload({
      practiceId: session.practiceId,
      audioId: session.audioId,
      uploadPath: session.uploadPath,
    });
  }
}

/** True while this tab uploads audio for the given item. */
export function isAuthorAudioUploadActive(audioId: string): boolean {
  const running = activeUploadAudioIds.get(audioId);
  return Boolean(running && !running.signal?.aborted);
}

/** True when a repeat with the same file would continue an interrupted upload. */
export function hasAuthorAudioResumeSession(input: {
  practiceId: string;
  audioId: string;
  file: File;
}): boolean {
  const session = resumeSessions.get(
    fileResumeKey(input.practiceId, input.audioId, input.file),
  );
  return Boolean(
    session && nowMs() - session.createdAt <= STUDIO_RESUMABLE_STORE_TTL_MS,
  );
}

function toAuthorProgress(progress: StudioResumableProgress): AuthorAudioUploadProgress {
  return {
    phase: progress.phase,
    uploadedBytes: progress.uploadedBytes,
    totalBytes: progress.totalBytes,
    percent: Math.min(99, Math.max(0, Math.floor(progress.percent))),
    retryInSeconds:
      progress.retryInMs == null
        ? null
        : Math.max(0, Math.ceil(progress.retryInMs / 1000)),
  };
}

function reportFinalizing(file: Blob, onProgress?: AuthorAudioUploadProgressHandler) {
  onProgress?.({
    phase: "finalizing",
    uploadedBytes: file.size,
    totalBytes: file.size,
    percent: 99,
    retryInSeconds: null,
  });
}

type TransferOutcome =
  | { kind: "stored" }
  | { kind: "interrupted"; status: number | null }
  | { kind: "too_large" }
  | { kind: "failed"; storageError?: AuthorSignedUploadErrorReport; tokenExpired: boolean };

async function transferToSignedUpload(input: {
  session: ResumeSession;
  file: File;
  uploadMime: string;
  signal?: AbortSignal;
  onProgress?: AuthorAudioUploadProgressHandler;
}): Promise<TransferOutcome> {
  const base = supabasePublicUrl();
  if (base && input.file.size >= STUDIO_RESUMABLE_MIN_BYTES) {
    try {
      const { supabaseUrl: _ignored, nowMs: _ignoredNow, ...overrides } =
        resumableTestOverrides ?? {};
      void _ignored;
      void _ignoredNow;
      await uploadStudioFileResumable({
        supabaseUrl: base,
        bucket: PRACTICE_AUDIO_BUCKET,
        signedUpload: input.session.signedUpload,
        file: input.file,
        contentType: input.uploadMime,
        signal: input.signal,
        ...overrides,
        onProgress: input.onProgress
          ? (progress) => input.onProgress?.(toAuthorProgress(progress))
          : undefined,
      });
      return { kind: "stored" };
    } catch (error) {
      if (isStudioAbortError(error) || input.signal?.aborted) throw error;
      if (!isStudioResumableUploadError(error)) throw error;
      if (error.kind === "already_exists") {
        // An earlier attempt already stored the object; finalize verifies it.
        return { kind: "stored" };
      }
      if (error.kind === "network") {
        return { kind: "interrupted", status: error.status };
      }
      if (error.kind === "too_large") return { kind: "too_large" };
      if (error.kind === "rejected") {
        const status = error.status ?? null;
        return {
          kind: "failed",
          tokenExpired:
            (status === 400 || status === 401 || status === 403) &&
            nowMs() - input.session.createdAt > STUDIO_RESUMABLE_STORE_TTL_MS,
          storageError: {
            code: status === 415 ? "invalid_mime_type" : "upload_rejected",
            status,
            statusCode: status == null ? null : String(status),
            message: "tus_rejected",
          },
        };
      }
      // "unsupported": fall back to the single signed PUT below.
    }
  }

  input.onProgress?.({
    phase: "uploading",
    uploadedBytes: 0,
    totalBytes: input.file.size,
    percent: 0,
    retryInSeconds: null,
  });
  const { error: storageError } = await createClient()
    .storage
    .from(PRACTICE_AUDIO_BUCKET)
    .uploadToSignedUrl(
      input.session.signedUpload.path,
      input.session.signedUpload.token,
      fileForSignedAuthorAudioUpload(input.file, input.file.name, input.uploadMime),
      {
        contentType: input.uploadMime,
        upsert: false,
      },
    );
  if (storageError) {
    const classified = classifyAuthorSignedUploadError(storageError);
    return {
      kind: "failed",
      storageError: classified,
      tokenExpired: classified.code === "upload_token_expired",
    };
  }
  return { kind: "stored" };
}

export async function uploadAuthorProductAudioDirect(input: {
  practiceId: string;
  audioId: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: AuthorAudioUploadProgressHandler;
}): Promise<AuthorProductAudioUploadResult> {
  const validationError = validateProductAudioFileClient(input.file);
  if (validationError) {
    return {
      ok: false,
      error:
        validationError === PRODUCT_AUDIO_TOO_LARGE_MESSAGE
          ? "invalid_file_size"
          : "invalid_file_type",
      message: validationError,
      status: 400,
    };
  }

  const running = activeUploadAudioIds.get(input.audioId);
  // An aborted upload (cancel, replaced file) no longer blocks a new one.
  if (running && !running.signal?.aborted) {
    return {
      ok: false,
      error: "upload_in_progress",
      message: "Аудио уже загружается – дождитесь окончания.",
      status: 409,
    };
  }
  const entry = { signal: input.signal };
  activeUploadAudioIds.set(input.audioId, entry);
  try {
    return await uploadWithSession(input);
  } finally {
    if (activeUploadAudioIds.get(input.audioId) === entry) {
      activeUploadAudioIds.delete(input.audioId);
    }
  }
}

async function uploadWithSession(input: {
  practiceId: string;
  audioId: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: AuthorAudioUploadProgressHandler;
}): Promise<AuthorProductAudioUploadResult> {
  const key = fileResumeKey(input.practiceId, input.audioId, input.file);
  await discardOtherSessions({
    practiceId: input.practiceId,
    audioId: input.audioId,
    keepKey: key,
  });

  let session = resumeSessions.get(key) ?? null;
  if (!session) {
    let startResponse: Response;
    let started: StartPayload | null;
    try {
      startResponse = await fetch(
        `/api/author/products/${input.practiceId}/audio/${input.audioId}/upload/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: input.file.name,
            file_size: input.file.size,
            mime_type: input.file.type,
          }),
          signal: input.signal,
        },
      );
      started = await readJson<StartPayload>(startResponse);
    } catch (error) {
      if (isStudioAbortError(error) || input.signal?.aborted) throw error;
      return { ok: false, error: AUTHOR_AUDIO_UPLOAD_NETWORK, status: 0 };
    }
    if (
      !startResponse.ok ||
      !started?.upload_path ||
      !isSignedUpload(started.signedUpload)
    ) {
      return {
        ok: false,
        error: started?.error,
        message: started?.message,
        status: startResponse.status,
      };
    }
    session = {
      key,
      practiceId: input.practiceId,
      audioId: input.audioId,
      uploadPath: started.upload_path,
      signedUpload: started.signedUpload,
      createdAt: nowMs(),
    };
  }

  const uploadPath = session.uploadPath;
  const uploadMime = canonicalProductAudioUploadMime(
    detectProductAudioSourceFormat(input.file.name) ?? "mp3",
  );
  const dropSession = async (storageError?: AuthorSignedUploadErrorReport) => {
    if (session) forgetSession(session);
    await abandonProductAudioUpload({
      practiceId: input.practiceId,
      audioId: input.audioId,
      uploadPath,
      ...(storageError ? { storageError } : {}),
    });
  };

  try {
    const outcome = await transferToSignedUpload({
      session,
      file: input.file,
      uploadMime,
      signal: input.signal,
      onProgress: input.onProgress,
    });

    if (outcome.kind === "interrupted") {
      // Keep the signed upload: «Повторить» with the same file resumes.
      resumeSessions.set(key, session);
      return {
        ok: false,
        error: AUTHOR_AUDIO_UPLOAD_INTERRUPTED,
        status: outcome.status ?? 0,
      };
    }
    if (outcome.kind === "too_large") {
      await dropSession();
      return { ok: false, error: "invalid_file_size", status: 413 };
    }
    if (outcome.kind === "failed") {
      await dropSession(outcome.storageError);
      return {
        ok: false,
        error: outcome.tokenExpired
          ? "upload_token_expired"
          : outcome.storageError?.code === "upload_network"
            ? AUTHOR_AUDIO_UPLOAD_NETWORK
            : "upload_failed",
        status: outcome.storageError?.code === "upload_network" ? 0 : 502,
      };
    }

    resumeSessions.delete(key);
    reportFinalizing(input.file, input.onProgress);
    let finalizeResponse: Response;
    let finalized: FinalizePayload | null;
    try {
      finalizeResponse = await fetch(
        `/api/author/products/${input.practiceId}/audio/${input.audioId}/upload/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upload_path: uploadPath,
            file_name: input.file.name,
            file_size: input.file.size,
          }),
          signal: input.signal,
        },
      );
      finalized = await readJson<FinalizePayload>(finalizeResponse);
    } catch (error) {
      if (isStudioAbortError(error) || input.signal?.aborted) throw error;
      // Finalize is not repeated blindly: it may have applied the file on the
      // server. Abandon is guarded and never deletes the live audio.
      await dropSession();
      return { ok: false, error: AUTHOR_AUDIO_UPLOAD_NETWORK, status: 0 };
    }
    if (!finalizeResponse.ok || !finalized?.product) {
      forgetSession(session);
      if (finalized?.error !== "stale_music_upload") {
        await abandonProductAudioUpload({
          practiceId: input.practiceId,
          audioId: input.audioId,
          uploadPath,
        });
      }
      return {
        ok: false,
        error: finalized?.error,
        message: finalized?.message,
        status: finalizeResponse.status,
      };
    }

    forgetSession(session);
    input.onProgress?.({
      phase: "finalizing",
      uploadedBytes: input.file.size,
      totalBytes: input.file.size,
      percent: 100,
      retryInSeconds: null,
    });
    return { ok: true, product: finalized.product };
  } catch {
    await dropSession();
    return {
      ok: false,
      status: 500,
    };
  }
}
