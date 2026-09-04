import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fromAudioPreviewWindowColumns,
  resolvePlaybackPreviewWindow,
} from "@/lib/listen/preview-window";
import {
  extractMp3TimeRange,
  extractMp3TimeRangeFromStream,
} from "@/lib/listen/mp3-preview-clip";
import {
  LISTEN_SIGNED_URL_TTL_SECONDS,
  normalizeStorageSignedUrl,
} from "@/lib/listen/signed-url";

const PREVIEW_SOURCE_SIGN_TTL_SECONDS = 60;
const CLIP_CACHE_TTL_MS = 10 * 60 * 1000;
const CLIP_CACHE_MAX_ENTRIES = 24;

type CachedClip = {
  bytes: Uint8Array;
  expiresAt: number;
};

const clipCache = new Map<string, CachedClip>();

export type PreviewAudioItemRow = {
  id: string;
  audio_path: string | null;
  status: string | null;
  duration_seconds?: number | null;
  preview_start_ms?: number | null;
  preview_end_ms?: number | null;
};

export function resolvePreviewClipWindow(row: {
  duration_seconds?: number | null;
  preview_start_ms?: number | null;
  preview_end_ms?: number | null;
}) {
  const durationMs =
    typeof row.duration_seconds === "number" &&
    Number.isFinite(row.duration_seconds) &&
    row.duration_seconds > 0
      ? Math.round(row.duration_seconds * 1000)
      : null;

  return resolvePlaybackPreviewWindow(
    fromAudioPreviewWindowColumns(row),
    durationMs,
  );
}

function clipCacheKey(
  practiceId: string,
  audioId: string,
  audioPath: string,
  startMs: number,
  endMs: number,
): string {
  return `${practiceId}:${audioId}:${audioPath}:${startMs}:${endMs}`;
}

function readClipCache(key: string): Uint8Array | null {
  const entry = clipCache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    clipCache.delete(key);
    return null;
  }

  return entry.bytes;
}

function writeClipCache(key: string, bytes: Uint8Array) {
  if (clipCache.size >= CLIP_CACHE_MAX_ENTRIES) {
    const first = clipCache.keys().next().value;

    if (typeof first === "string") {
      clipCache.delete(first);
    }
  }

  clipCache.set(key, {
    bytes,
    expiresAt: Date.now() + CLIP_CACHE_TTL_MS,
  });
}

async function downloadPracticeAudio(
  storageClient: SupabaseClient,
  audioPath: string,
): Promise<{
  source: Uint8Array | ReadableStream<Uint8Array>;
  abort: () => void;
}> {
  const { data, error } = await storageClient.storage
    .from("practice-audio")
    .createSignedUrl(audioPath, PREVIEW_SOURCE_SIGN_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error("preview_source_sign_failed");
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);

  if (!url) {
    throw new Error("preview_source_sign_failed");
  }

  const controller = new AbortController();
  const response = await fetch(url, {
    cache: "no-store",
    signal: controller.signal,
  });

  if (!response.ok) {
    throw new Error("preview_source_fetch_failed");
  }

  if (response.body) {
    return {
      source: response.body,
      abort: () => controller.abort(),
    };
  }

  const buffer = new Uint8Array(await response.arrayBuffer());

  if (buffer.byteLength === 0) {
    throw new Error("preview_source_empty");
  }

  return { source: buffer, abort: () => controller.abort() };
}

export async function buildPracticePreviewClip(input: {
  storageClient: SupabaseClient;
  practiceId: string;
  audioItem: PreviewAudioItemRow;
}): Promise<{
  bytes: Uint8Array;
  startMs: number;
  endMs: number;
  expiresIn: number;
}> {
  const audioPath = input.audioItem.audio_path?.trim() ?? "";

  if (!audioPath) {
    throw new Error("audio_missing");
  }

  const window = resolvePreviewClipWindow(input.audioItem);
  const key = clipCacheKey(
    input.practiceId,
    input.audioItem.id,
    audioPath,
    window.startMs,
    window.endMs,
  );
  const cached = readClipCache(key);

  if (cached) {
    return {
      bytes: cached,
      startMs: window.startMs,
      endMs: window.endMs,
      expiresIn: LISTEN_SIGNED_URL_TTL_SECONDS,
    };
  }

  const downloaded = await downloadPracticeAudio(input.storageClient, audioPath);
  const extracted =
    downloaded.source instanceof Uint8Array
      ? extractMp3TimeRange(downloaded.source, window.startMs, window.endMs)
      : await extractMp3TimeRangeFromStream(
          downloaded.source,
          window.startMs,
          window.endMs,
          { abort: downloaded.abort },
        );

  writeClipCache(key, extracted.bytes);

  return {
    bytes: extracted.bytes,
    startMs: window.startMs,
    endMs: window.endMs,
    expiresIn: LISTEN_SIGNED_URL_TTL_SECONDS,
  };
}
