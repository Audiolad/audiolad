export function buildListenPreviewClipPath(
  listenApiBase: string,
  audioItemId: string,
): string {
  return `${listenApiBase.replace(/\/$/, "")}/audio/${audioItemId}/clip`;
}

export function isListenPreviewClipPath(url: string): boolean {
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    return /\/audio\/[^/]+\/clip\/?$/.test(path);
  } catch {
    return /\/audio\/[^/]+\/clip\/?$/.test(url);
  }
}

export type ByteRange = {
  start: number;
  end: number;
};

export function parseHttpByteRange(
  header: string | null,
  totalLength: number,
): ByteRange | null {
  if (!header || totalLength <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());

  if (!match) {
    return null;
  }

  const startRaw = match[1];
  const endRaw = match[2];

  if (!startRaw && !endRaw) {
    return null;
  }

  if (!startRaw) {
    const suffix = Number(endRaw);

    if (!Number.isInteger(suffix) || suffix <= 0) {
      return null;
    }

    const start = Math.max(0, totalLength - suffix);
    return { start, end: totalLength - 1 };
  }

  const start = Number(startRaw);

  if (!Number.isInteger(start) || start < 0 || start >= totalLength) {
    return null;
  }

  const end = endRaw
    ? Number(endRaw)
    : totalLength - 1;

  if (!Number.isInteger(end) || end < start) {
    return null;
  }

  return { start, end: Math.min(end, totalLength - 1) };
}

export function sliceBytesForRange(
  bytes: Uint8Array,
  rangeHeader: string | null,
): {
  status: number;
  body: Uint8Array;
  contentRange?: string;
} {
  const range = parseHttpByteRange(rangeHeader, bytes.byteLength);

  if (!range) {
    return { status: 200, body: bytes };
  }

  return {
    status: 206,
    body: bytes.subarray(range.start, range.end + 1),
    contentRange: `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
  };
}

export function previewClipResponseHeaders(input: {
  contentLength: number;
  contentRange?: string;
}): Headers {
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Content-Length": String(input.contentLength),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });

  if (input.contentRange) {
    headers.set("Content-Range", input.contentRange);
  }

  return headers;
}
