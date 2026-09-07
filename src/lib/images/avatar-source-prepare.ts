import sharp from "sharp";

import {
  AVATAR_HEIC_CONVERT_TIMEOUT_MS,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_PREVIEW_MAX_EDGE,
} from "@/lib/images/avatar-constants";
import { convertHeicToJpegBuffer, isHeicLikeMime } from "@/lib/images/heic-fallback";
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

function buildSharpInput(input: Buffer) {
  return sharp(input, {
    failOn: "error",
    limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
    sequentialRead: true,
    animated: false,
  });
}

async function readSharpMetadata(input: Buffer) {
  try {
    return { ok: true as const, meta: await buildSharpInput(input).metadata() };
  } catch {
    return { ok: false as const };
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
): Promise<PreparedAvatarSource> {
  if (!isAvatarImageProfile(profile)) {
    return { ok: false, code: "invalid_file_type" };
  }

  const validated = validateImageBufferForProfile(input, declaredMime, profile);

  if (!validated.ok) {
    return validated;
  }

  let working = input;
  const headerMeta = await readSharpMetadata(working);

  if (headerMeta.ok) {
    const boundError = validateImageSourceBounds(
      headerMeta.meta.width ?? 0,
      headerMeta.meta.height ?? 0,
      profile,
    );

    if (boundError) {
      return { ok: false, code: boundError };
    }
  }

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
      working = await convertHeicToJpegBuffer(input, AVATAR_HEIC_CONVERT_TIMEOUT_MS);
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
