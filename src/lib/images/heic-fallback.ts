import convert from "heic-convert";

import { AVATAR_HEIC_CONVERT_TIMEOUT_MS } from "@/lib/images/avatar-constants";

export function isHeicLikeMime(
  mime: string | null | undefined,
): boolean {
  const normalized = (mime ?? "").trim().toLowerCase();
  return (
    normalized === "image/heic" ||
    normalized === "image/heif" ||
    normalized === "image/heic-sequence" ||
    normalized === "image/heif-sequence"
  );
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("heic_convert_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * WASM libheif via heic-convert — no apt/system libheif.
 * Viable on Timeweb/PM2 as a regular Node dependency.
 */
export async function convertHeicToJpegBuffer(
  input: Buffer,
  timeoutMs = AVATAR_HEIC_CONVERT_TIMEOUT_MS,
): Promise<Buffer> {
  const converted = await withTimeout(
    Promise.resolve(
      convert({
        buffer: input,
        format: "JPEG",
        quality: 0.9,
      }),
    ),
    timeoutMs,
  );

  const jpeg = Buffer.from(converted);

  if (jpeg.length < 3 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) {
    throw new Error("heic_convert_invalid_output");
  }

  return jpeg;
}
