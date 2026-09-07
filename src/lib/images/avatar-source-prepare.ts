import sharp from "sharp";

import {
  AVATAR_HEIC_CONVERT_TIMEOUT_MS,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_PREVIEW_MAX_EDGE,
} from "@/lib/images/avatar-constants";
import {
  convertHeicToJpegBuffer,
  isHeicLikeMime,
} from "@/lib/images/heic-fallback";
import { peekImageHeaderDimensions } from "@/lib/images/image-magic";
import type { ImageProcessErrorCode } from "@/lib/images/image-types";
import type { ImageProfile } from "@/lib/images/image-types";
import {
  isAvatarImageProfile,
  validateImageBufferForProfile,
  validateImageSourceBounds,
} from "@/lib/images/validate-image";

const SHARP_AVATAR_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);

export type PreparedAvatarSource =
  | {
      ok: true;
      buffer: Buffer;
      width: number;
      height: number;
      sourceKind: string;
    }
  | { ok: false; code: ImageProcessErrorCode };

export type PrepareAvatarSourceOptions = {
  convertHeic?: typeof convertHeicToJpegBuffer;
};

function buildSharpInput(input: Buffer) {
  return sharp(input, {
    failOn: "error",
    limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
    sequentialRead: true,
    animated: false,
  });
}

/**
 * Header-only dimensions. Must NOT use limitInputPixels — that gate can throw
 * "exceeds pixel limit" before width/height are available, skipping bounds
 * and leaking over-limit HEIC into WASM.
 */
export async function readAvatarHeaderDimensions(
  input: Buffer,
): Promise<{ width: number; height: number } | null> {
  const parsed = peekImageHeaderDimensions(input);

  if (parsed) {
    return parsed;
  }

  try {
    const meta = await sharp(input, {
      failOn: "none",
      sequentialRead: true,
      animated: false,
    }).metadata();

    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    return width > 0 && height > 0 ? { width, height } : null;
  } catch {
    return null;
  }
}

async function trySharpDecode(input: Buffer, profile: ImageProfile) {
  try {
    const pipeline = buildSharpInput(input).rotate();
    const meta = await pipeline.clone().metadata();
    const boundError = validateImageSourceBounds(
      meta.width ?? 0,
      meta.height ?? 0,
      profile,
    );

    if (boundError) {
      return { ok: false as const, code: boundError };
    }

    await pipeline.clone().jpeg({ quality: 90 }).toBuffer();
    return { ok: true as const, meta };
  } catch {
    return { ok: false as const };
  }
}

export async function prepareAvatarSourceBuffer(
  input: Buffer,
  declaredMime: string | null | undefined,
  profile: ImageProfile = "user-avatar",
  options?: PrepareAvatarSourceOptions,
): Promise<PreparedAvatarSource> {
  if (!isAvatarImageProfile(profile)) {
    return { ok: false, code: "invalid_file_type" };
  }

  const validated = validateImageBufferForProfile(input, declaredMime, profile);

  if (!validated.ok) {
    return validated;
  }

  const header = await readAvatarHeaderDimensions(input);

  if (header) {
    const boundError = validateImageSourceBounds(header.width, header.height, profile);

    if (boundError) {
      return { ok: false, code: boundError };
    }
  } else if (
    isHeicLikeMime(validated.data.magicMime) ||
    validated.data.magicMime === "image/heic" ||
    validated.data.magicMime === "image/heif"
  ) {
    // No dimensions → do not WASM-decode a possible decompression bomb.
    return { ok: false, code: "corrupt_image" };
  }

  let working = input;
  let sharpMeta = await trySharpDecode(working, profile);

  if (sharpMeta.ok === false && sharpMeta.code) {
    return { ok: false, code: sharpMeta.code };
  }

  if (
    !sharpMeta.ok &&
    (isHeicLikeMime(validated.data.magicMime) ||
      validated.data.magicMime === "image/heic" ||
      validated.data.magicMime === "image/heif")
  ) {
    try {
      const convertHeic = options?.convertHeic ?? convertHeicToJpegBuffer;
      working = await convertHeic(input, AVATAR_HEIC_CONVERT_TIMEOUT_MS);
      sharpMeta = await trySharpDecode(working, profile);
    } catch {
      return { ok: false, code: "corrupt_image" };
    }
  }

  if (!sharpMeta.ok) {
    return { ok: false, code: sharpMeta.code ?? "corrupt_image" };
  }

  const format = sharpMeta.meta.format ?? "";

  if (!SHARP_AVATAR_FORMATS.has(format)) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (sharpMeta.meta.pages && sharpMeta.meta.pages > 1 && format !== "heif") {
    return { ok: false, code: "invalid_file_type" };
  }

  const width = sharpMeta.meta.width ?? 0;
  const height = sharpMeta.meta.height ?? 0;
  const dimensionError = validateImageSourceBounds(width, height, profile);

  if (dimensionError) {
    return { ok: false, code: dimensionError };
  }

  return {
    ok: true,
    buffer: working,
    width,
    height,
    sourceKind: validated.data.magicMime,
  };
}

export async function renderAvatarPreviewJpeg(
  input: Buffer,
  declaredMime: string | null | undefined,
): Promise<PreparedAvatarSource & { preview?: Buffer }> {
  const prepared = await prepareAvatarSourceBuffer(input, declaredMime, "user-avatar");

  if (!prepared.ok) {
    return prepared;
  }

  try {
    const { data, info } = await buildSharpInput(prepared.buffer)
      .rotate()
      .resize({
        width: AVATAR_PREVIEW_MAX_EDGE,
        height: AVATAR_PREVIEW_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    return {
      ok: true,
      buffer: data,
      width: info.width,
      height: info.height,
      sourceKind: prepared.sourceKind,
      preview: data,
    };
  } catch {
    return { ok: false, code: "corrupt_image" };
  }
}
