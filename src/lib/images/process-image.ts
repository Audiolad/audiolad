import { randomUUID } from "node:crypto";

import sharp from "sharp";

import {
  IMAGE_MAX_INPUT_PIXELS,
  PLACEHOLDER_MAX_BYTES,
} from "@/lib/images/image-constants";
import { getImageProfileConfig, getPlaceholderSpec } from "@/lib/images/image-profiles";
import type {
  ImageProcessErrorCode,
  ImageProfile,
  ProcessedImageSet,
  ProcessedImageVariant,
} from "@/lib/images/image-types";
import {
  validateImageBufferForProfile,
  validateImageDimensions,
} from "@/lib/images/validate-image";

export type ProcessImageResult =
  | { ok: true; data: ProcessedImageSet }
  | { ok: false; code: ImageProcessErrorCode };

function buildSharpInput(input: Buffer) {
  return sharp(input, {
    failOn: "error",
    limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
    sequentialRead: true,
    animated: false,
  });
}

async function encodeVariant(
  pipeline: sharp.Sharp,
  quality: number,
  hasAlpha: boolean,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const webpOptions = hasAlpha
    ? { quality, effort: 4, lossless: false, alphaQuality: 100 }
    : { quality, effort: 4 };

  const { data, info } = await pipeline
    .webp(webpOptions)
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    width: info.width,
    height: info.height,
  };
}

export async function processImageForProfile(
  input: Buffer,
  declaredMime: string | null | undefined,
  profile: ImageProfile,
  options?: {
    versionId?: string;
    skipOriginalStore?: boolean;
  },
): Promise<ProcessImageResult> {
  const validated = validateImageBufferForProfile(input, declaredMime, profile);

  if (!validated.ok) {
    return validated;
  }

  const config = getImageProfileConfig(profile);
  const versionId = options?.versionId ?? randomUUID();

  try {
    const meta = await buildSharpInput(input).metadata();

    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      return { ok: false, code: "invalid_file_type" };
    }

    if (meta.pages && meta.pages > 1) {
      return { ok: false, code: "invalid_file_type" };
    }

    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const dimensionError = validateImageDimensions(width, height, profile);

    if (dimensionError) {
      return { ok: false, code: dimensionError };
    }

    const hasAlpha = meta.hasAlpha === true;
    const rotated = buildSharpInput(input).rotate();
    const variants: ProcessedImageVariant[] = [];

    for (const spec of config.variants) {
      const resizeOptions = {
        fit: spec.fit,
        position: "centre" as const,
        withoutEnlargement: !config.allowUpscale,
      };

      const encoded = await encodeVariant(
        rotated
          .clone()
          .resize(spec.width, spec.height, resizeOptions),
        spec.quality,
        hasAlpha,
      );

      if (!encoded.buffer.length) {
        if (spec.required) {
          return { ok: false, code: "corrupt_image" };
        }
        continue;
      }

      variants.push({
        key: spec.key,
        buffer: encoded.buffer,
        width: encoded.width,
        height: encoded.height,
        byteSize: encoded.buffer.length,
        mimeType: "image/webp",
      });
    }

    let placeholderBlurDataUrl: string | null = null;

    if (config.includePlaceholder) {
      const placeholderSpec = getPlaceholderSpec();
      const placeholderEncoded = await encodeVariant(
        buildSharpInput(input)
          .rotate()
          .resize(placeholderSpec.width, placeholderSpec.height, {
            fit: "cover",
            position: "centre",
            withoutEnlargement: true,
          }),
        placeholderSpec.quality,
        hasAlpha,
      );

      if (
        placeholderEncoded.buffer.length > 0 &&
        placeholderEncoded.buffer.length <= PLACEHOLDER_MAX_BYTES
      ) {
        placeholderBlurDataUrl = `data:image/webp;base64,${placeholderEncoded.buffer.toString("base64")}`;
        variants.push({
          key: "placeholder",
          buffer: placeholderEncoded.buffer,
          width: placeholderEncoded.width,
          height: placeholderEncoded.height,
          byteSize: placeholderEncoded.buffer.length,
          mimeType: "image/webp",
        });
      }
    }

    const requiredKeys = config.variants.filter((v) => v.required).map((v) => v.key);
    const producedKeys = new Set(variants.map((v) => v.key));

    for (const key of requiredKeys) {
      if (!producedKeys.has(key)) {
        return { ok: false, code: "corrupt_image" };
      }
    }

    return {
      ok: true,
      data: {
        profile,
        versionId,
        sourceWidth: width,
        sourceHeight: height,
        originalBuffer: options?.skipOriginalStore ? Buffer.alloc(0) : input,
        originalExtension: validated.data.originalExtension,
        variants,
        placeholderBlurDataUrl,
      },
    };
  } catch {
    return { ok: false, code: "corrupt_image" };
  }
}

export function imageProcessErrorMessage(
  code: ImageProcessErrorCode,
  profile?: ImageProfile,
): string {
  switch (code) {
    case "missing_file":
      return "Выберите изображение.";
    case "invalid_file_size":
      if (profile === "playlist-cover") {
        return "Размер изображения не должен превышать 5 МБ.";
      }
      return "Размер изображения не должен превышать 3 МБ.";
    case "invalid_file_type":
      return "Выберите изображение JPG, PNG или WebP.";
    case "invalid_aspect_ratio":
      if (profile === "author-banner") {
        return "Минимальный размер баннера — 1200 × 400 пикселей.";
      }
      if (profile === "author-avatar" || profile === "user-avatar") {
        return "Не удалось сохранить фотографию. Попробуйте ещё раз.";
      }
      return "Минимальный размер изображения — 400 × 400 пикселей.";
    case "image_too_large":
      return "Изображение слишком большое. Выберите файл меньшего разрешения.";
    case "corrupt_image":
      return "Не удалось открыть изображение. Попробуйте выбрать другой файл.";
    default:
      return "Не удалось сохранить изображение. Попробуйте ещё раз.";
  }
}
