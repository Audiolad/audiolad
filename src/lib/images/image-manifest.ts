import type {
  ImageManifest,
  ImageProfile,
  ImageVariant,
  ImageVariantKey,
  ProcessedImageSet,
} from "@/lib/images/image-types";

export const IMAGE_MANIFEST_VERSION = 1;

export function buildImageManifestFromProcessed(
  processed: ProcessedImageSet,
  paths: {
    originalPath?: string;
    variantPaths: Partial<Record<ImageVariantKey, string>>;
  },
): ImageManifest {
  const variants: Partial<Record<ImageVariantKey, ImageVariant>> = {};

  for (const variant of processed.variants) {
    const path = paths.variantPaths[variant.key];

    if (!path) {
      continue;
    }

    variants[variant.key] = {
      path,
      width: variant.width,
      height: variant.height,
      byteSize: variant.byteSize,
      mimeType: variant.mimeType,
    };
  }

  return {
    version: IMAGE_MANIFEST_VERSION,
    versionId: processed.versionId,
    profile: processed.profile,
    sourceWidth: processed.sourceWidth,
    sourceHeight: processed.sourceHeight,
    originalPath: paths.originalPath,
    variants,
    placeholderBlurDataUrl: processed.placeholderBlurDataUrl ?? undefined,
  };
}

export function parseImageManifest(value: unknown): ImageManifest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.version !== "number" || record.version < 1) {
    return null;
  }

  if (typeof record.versionId !== "string" || !record.versionId.trim()) {
    return null;
  }

  if (typeof record.profile !== "string") {
    return null;
  }

  if (
    typeof record.sourceWidth !== "number" ||
    typeof record.sourceHeight !== "number"
  ) {
    return null;
  }

  if (!record.variants || typeof record.variants !== "object") {
    return null;
  }

  return record as ImageManifest;
}

export function getManifestVariantPath(
  manifest: ImageManifest | null | undefined,
  key: ImageVariantKey,
): string | null {
  const variant = manifest?.variants?.[key];

  if (!variant?.path?.trim()) {
    return null;
  }

  return variant.path.trim();
}

export function getPrimaryVariantKey(profile: ImageProfile): ImageVariantKey {
  switch (profile) {
    case "author-avatar":
    case "user-avatar":
      return "lg";
    case "author-banner":
      return "md";
    default:
      return "lg";
  }
}

export function listManifestStoragePaths(manifest: ImageManifest): string[] {
  const paths: string[] = [];

  if (manifest.originalPath?.trim()) {
    paths.push(manifest.originalPath.trim());
  }

  for (const variant of Object.values(manifest.variants)) {
    if (variant?.path?.trim()) {
      paths.push(variant.path.trim());
    }
  }

  return paths;
}

/** Client-safe manifest: strips original path and internal storage details. */
export function sanitizePublicImageManifest(
  value: unknown,
): ImageManifest | null {
  const parsed = parseImageManifest(value);

  if (!parsed) {
    return null;
  }

  const { originalPath: _originalPath, ...rest } = parsed;

  return rest;
}

export function isOriginalStoragePath(path: string | null | undefined): boolean {
  if (!path?.trim()) {
    return false;
  }

  return /\/original\.(jpg|jpeg|png|webp)$/i.test(path.trim());
}
