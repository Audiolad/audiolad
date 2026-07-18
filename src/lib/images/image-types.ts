export type ImageProfile =
  | "product-cover"
  | "track-cover"
  | "author-avatar"
  | "user-avatar"
  | "author-banner"
  | "playlist-cover"
  | "diagnostic-image";

export type ImageVariantKey =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "placeholder";

export type ImageProcessErrorCode =
  | "missing_file"
  | "invalid_file_size"
  | "invalid_file_type"
  | "corrupt_image"
  | "invalid_aspect_ratio"
  | "image_too_large";

export type ProcessedImageVariant = {
  key: ImageVariantKey;
  buffer: Buffer;
  width: number;
  height: number;
  byteSize: number;
  mimeType: "image/webp";
};

export type ProcessedImageSet = {
  profile: ImageProfile;
  versionId: string;
  sourceWidth: number;
  sourceHeight: number;
  originalBuffer: Buffer;
  originalExtension: "jpg" | "png" | "webp";
  variants: ProcessedImageVariant[];
  placeholderBlurDataUrl: string | null;
};

export type ImageVariant = {
  path: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: "image/webp";
};

export type ImageManifest = {
  version: number;
  versionId: string;
  profile: ImageProfile;
  sourceWidth: number;
  sourceHeight: number;
  originalPath?: string;
  variants: Partial<Record<ImageVariantKey, ImageVariant>>;
  placeholderBlurDataUrl?: string;
};

export type StoredImageSet = {
  manifest: ImageManifest;
  /** Primary public or signed display URL (typically lg). */
  primaryDisplayPath: string;
};
