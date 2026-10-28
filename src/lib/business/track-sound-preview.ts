import { snapshotHasPermission, type PlatformAccessSnapshot } from "@/lib/auth/platform-access";

/** Reviewer fragment is 15 or 30 seconds. One response covers the longer fragment. */
export const BUSINESS_TRACK_PREVIEW_WINDOW_SECONDS = 30;
/** Extra seconds so a seek inside that fragment still lands in the same response. */
export const BUSINESS_TRACK_PREVIEW_SEEK_SLACK_SECONDS = 5;
/**
 * Lifetime of the storage URL used only inside the server. The browser never receives it.
 * Must stay well under the cabinet listen TTL.
 */
export const BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS = 60;
export const BUSINESS_TRACK_PREVIEW_CACHE_CONTROL = "private, no-store";
/** Used only when the track duration is unknown, so one response cannot be a long master. */
const FALLBACK_BITS_PER_SECOND = 320_000;

export function businessTrackPreviewWindowSeconds(): number {
  return BUSINESS_TRACK_PREVIEW_WINDOW_SECONDS + BUSINESS_TRACK_PREVIEW_SEEK_SLACK_SECONDS;
}

/**
 * Both grants are required. The platform snapshot treats the owner role as holding every permission.
 * Missing session is 401. Any other shortfall is 403.
 */
export function businessTrackPreviewStatus(access: PlatformAccessSnapshot | null): 401 | 403 | 200 {
  if (!access) return 401;
  if (
    !snapshotHasPermission(access, "admin_panel.access")
    || !snapshotHasPermission(access, "author_products.moderate")
  ) {
    return 403;
  }
  return 200;
}

export function businessTrackPreviewHref(id: string, audioIdentity: string): string {
  const params = new URLSearchParams({ id, identity: audioIdentity });
  return `/api/admin/business-track-review/preview?${params.toString()}`;
}

/** Byte budget for one response: about 30s of this file, plus slack to seek inside that window. */
export function previewByteCap(fileSize: number, durationSeconds: number | null): number {
  if (!Number.isFinite(fileSize) || fileSize <= 0) return 0;
  const seconds = businessTrackPreviewWindowSeconds();
  if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Math.max(1, Math.min(fileSize, Math.ceil((fileSize / durationSeconds) * seconds)));
  }
  const fallback = Math.ceil((FALLBACK_BITS_PER_SECOND / 8) * seconds);
  return Math.min(fileSize, fallback);
}

export function clipPreviewRange(
  fileSize: number,
  cap: number,
  header: string | null,
): { ok: false } | { ok: true; start: number; end: number } {
  if (!Number.isInteger(fileSize) || fileSize <= 0 || cap <= 0) return { ok: false };
  let start = 0;
  let requestedEnd = fileSize - 1;
  if (header != null && header.trim() !== "") {
    const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
    if (!match) return { ok: false };
    start = Number(match[1]);
    if (match[2] !== "") requestedEnd = Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start < 0 || start > requestedEnd || start >= fileSize) {
      return { ok: false };
    }
  }
  const end = Math.min(requestedEnd, start + cap - 1, fileSize - 1);
  return { ok: true, start, end };
}

export function previewResponseHeaders(input: {
  start: number;
  end: number;
  total: number;
  contentType: string;
}): Headers {
  const length = input.end - input.start + 1;
  return new Headers({
    "Cache-Control": BUSINESS_TRACK_PREVIEW_CACHE_CONTROL,
    "Accept-Ranges": "bytes",
    "Content-Range": `bytes ${input.start}-${input.end}/${input.total}`,
    "Content-Length": String(length),
    "Content-Type": input.contentType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  });
}

export function contentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const match = /\/(\d+)\s*$/.exec(header);
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isInteger(total) && total >= 0 ? total : null;
}

/** Stop reading once maxBytes is reached and cancel the rest of the upstream body. */
export async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!body || maxBytes <= 0) return new Uint8Array();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const room = maxBytes - total;
      const slice = value.byteLength > room ? value.subarray(0, room) : value;
      parts.push(slice);
      total += slice.byteLength;
      if (slice.byteLength < value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
