/**
 * Frame-accurate MPEG audio clipper.
 *
 * HTTP byte-range on the original file is not a security boundary for VBR MP3
 * or custom preview_start_ms. This walks frame headers so the client only
 * receives frames inside the allowed window.
 */

const MPEG_BITRATES_KBIT: Record<string, number[]> = {
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};

const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

export type Mp3FrameInfo = {
  offset: number;
  length: number;
  durationMs: number;
  bitrate: number;
  sampleRate: number;
};

export type ExtractMp3TimeRangeResult = {
  bytes: Uint8Array;
  startMs: number;
  endMs: number;
  durationMs: number;
  frameCount: number;
};

function readUint32(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) {
    return null;
  }

  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export function readId3v2Size(bytes: Uint8Array): number {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return 0;
  }

  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

export function peekMp3FrameLayout(
  bytes: Uint8Array,
  offset: number,
): Omit<Mp3FrameInfo, "offset"> | null {
  const header = readUint32(bytes, offset);

  if (header == null) {
    return null;
  }

  if (((header & 0xffe00000) >>> 0) !== 0xffe00000) {
    return null;
  }

  const versionBits = (header >> 19) & 0x3;
  const layerBits = (header >> 17) & 0x3;
  const bitrateIndex = (header >> 12) & 0xf;
  const sampleRateIndex = (header >> 10) & 0x3;
  const padding = (header >> 9) & 0x1;

  if (versionBits === 1 || layerBits === 0) {
    return null;
  }

  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const layer = 4 - layerBits;

  if (layer !== 3) {
    return null;
  }

  const versionId = versionBits === 3 ? 1 : 2;
  const bitrateTable =
    MPEG_BITRATES_KBIT[`${versionId}-${layer}`] ?? MPEG_BITRATES_KBIT["2-3"];
  const bitrate = (bitrateTable[bitrateIndex] ?? 0) * 1000;
  const rates = MPEG_SAMPLE_RATES[versionBits];
  const sampleRate = rates?.[sampleRateIndex] ?? 0;

  if (bitrate <= 0 || sampleRate <= 0) {
    return null;
  }

  const coefficient = versionId === 1 ? 144 : 72;
  const length = Math.floor((coefficient * bitrate) / sampleRate) + padding;
  const samplesPerFrame = versionId === 1 ? 1152 : 576;
  const durationMs = (samplesPerFrame / sampleRate) * 1000;

  if (length < 4) {
    return null;
  }

  return {
    length,
    durationMs,
    bitrate,
    sampleRate,
  };
}

export function parseMp3FrameHeader(
  bytes: Uint8Array,
  offset: number,
): Mp3FrameInfo | null {
  const layout = peekMp3FrameLayout(bytes, offset);

  if (!layout || offset + layout.length > bytes.length) {
    return null;
  }

  return {
    offset,
    ...layout,
  };
}

export function findNextMp3Frame(
  bytes: Uint8Array,
  from: number,
): Mp3FrameInfo | null {
  for (let offset = from; offset + 4 <= bytes.length; offset += 1) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      continue;
    }

    const frame = parseMp3FrameHeader(bytes, offset);

    if (frame) {
      return frame;
    }
  }

  return null;
}

export function estimateMaxMp3ClipBytes(durationMs: number): number {
  const safeMs = Math.max(0, durationMs) + 2_000;
  // 320 kbps + padding headroom. A copied original 100 MiB file fails this.
  return Math.ceil((320_000 / 8) * (safeMs / 1000) * 2);
}

function assertValidWindow(startMs: number, endMs: number) {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    throw new Error("preview_window_invalid");
  }
}

export function extractMp3TimeRange(
  source: Uint8Array,
  startMs: number,
  endMs: number,
): ExtractMp3TimeRangeResult {
  assertValidWindow(startMs, endMs);

  const windowMs = endMs - startMs;
  const maxBytes = estimateMaxMp3ClipBytes(windowMs);
  const id3 = readId3v2Size(source);
  const chunks: Uint8Array[] = [];
  let cursor = id3;
  let timeMs = 0;
  let copiedMs = 0;
  let copiedBytes = 0;
  let frameCount = 0;

  while (cursor < source.length) {
    if (
      cursor + 128 <= source.length &&
      source[cursor] === 0x54 &&
      source[cursor + 1] === 0x41 &&
      source[cursor + 2] === 0x47 &&
      timeMs > 0
    ) {
      break;
    }

    const frame = findNextMp3Frame(source, cursor);

    if (!frame) {
      break;
    }

    const frameEndMs = timeMs + frame.durationMs;

    if (frameEndMs > startMs && timeMs < endMs) {
      const slice = source.subarray(frame.offset, frame.offset + frame.length);
      copiedBytes += slice.length;

      if (copiedBytes > maxBytes) {
        throw new Error("preview_clip_too_large");
      }

      chunks.push(slice);
      copiedMs += frame.durationMs;
      frameCount += 1;
    }

    timeMs = frameEndMs;
    cursor = frame.offset + frame.length;

    if (timeMs >= endMs) {
      break;
    }
  }

  if (frameCount === 0 || copiedBytes === 0) {
    throw new Error("preview_clip_empty");
  }

  const bytes = new Uint8Array(copiedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    bytes,
    startMs,
    endMs,
    durationMs: copiedMs,
    frameCount,
  };
}

function concatBytes(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

export async function extractMp3TimeRangeFromStream(
  stream: ReadableStream<Uint8Array>,
  startMs: number,
  endMs: number,
  options?: { abort?: () => void },
): Promise<ExtractMp3TimeRangeResult> {
  assertValidWindow(startMs, endMs);

  const windowMs = endMs - startMs;
  const maxBytes = estimateMaxMp3ClipBytes(windowMs);
  const reader = stream.getReader();
  let buffer = new Uint8Array(0);
  let skippedId3 = false;
  let timeMs = 0;
  const chunks: Uint8Array[] = [];
  let copiedBytes = 0;
  let copiedMs = 0;
  let frameCount = 0;
  let doneReading = false;

  const append = (chunk: Uint8Array) => {
    const next = new Uint8Array(buffer.length + chunk.length);
    next.set(buffer);
    next.set(chunk, buffer.length);
    buffer = next;
  };

  const consume = (): boolean => {
    let cursor = 0;

    if (!skippedId3) {
      if (buffer.length >= 3 && buffer[0] === 0x49) {
        if (buffer.length < 10) {
          return false;
        }

        const id3 = readId3v2Size(buffer);

        if (buffer.length < id3) {
          return false;
        }

        cursor = id3;
      }

      skippedId3 = true;
    }

    while (cursor + 4 <= buffer.length) {
      if (
        cursor + 128 <= buffer.length &&
        buffer[cursor] === 0x54 &&
        buffer[cursor + 1] === 0x41 &&
        buffer[cursor + 2] === 0x47 &&
        timeMs > 0
      ) {
        buffer = new Uint8Array(0);
        return true;
      }

      if (buffer[cursor] !== 0xff || (buffer[cursor + 1] & 0xe0) !== 0xe0) {
        cursor += 1;
        continue;
      }

      const layout = peekMp3FrameLayout(buffer, cursor);

      if (!layout) {
        cursor += 1;
        continue;
      }

      if (cursor + layout.length > buffer.length) {
        buffer = buffer.subarray(cursor);
        return false;
      }

      const frameEndMs = timeMs + layout.durationMs;

      if (frameEndMs > startMs && timeMs < endMs) {
        const slice = buffer.subarray(cursor, cursor + layout.length);
        copiedBytes += slice.length;

        if (copiedBytes > maxBytes) {
          throw new Error("preview_clip_too_large");
        }

        chunks.push(slice.slice());
        copiedMs += layout.durationMs;
        frameCount += 1;
      }

      timeMs = frameEndMs;
      cursor += layout.length;

      if (timeMs >= endMs) {
        buffer = new Uint8Array(0);
        return true;
      }
    }

    buffer = buffer.subarray(cursor);
    return false;
  };

  try {
    for (;;) {
      if (consume()) {
        options?.abort?.();
        break;
      }

      if (doneReading) {
        break;
      }

      const { done, value } = await reader.read();

      if (done) {
        doneReading = true;
        consume();
        break;
      }

      if (value?.length) {
        append(value);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released after abort.
    }
  }

  if (frameCount === 0 || copiedBytes === 0) {
    throw new Error("preview_clip_empty");
  }

  return {
    bytes: concatBytes(chunks, copiedBytes),
    startMs,
    endMs,
    durationMs: copiedMs,
    frameCount,
  };
}
