import type { ImageProfile, ImageVariantKey } from "@/lib/images/image-types";

import {
  IMAGE_DEFAULT_MAX_UPLOAD_BYTES,
  PLACEHOLDER_QUALITY,
  PLACEHOLDER_SIZE,
} from "./image-constants";

export type VariantSpec = {
  key: ImageVariantKey;
  width: number;
  height: number;
  quality: number;
  fit: "cover" | "inside";
  required: boolean;
};

export type ImageProfileConfig = {
  profile: ImageProfile;
  maxUploadBytes: number;
  minSourceWidth?: number;
  minSourceHeight?: number;
  requireSquare?: boolean;
  targetAspectRatio?: number;
  aspectTolerance?: number;
  variants: VariantSpec[];
  includePlaceholder: boolean;
  allowUpscale: boolean;
  /** Persist upload original in Storage (private buckets only). */
  storesOriginal: boolean;
};

const SQUARE_COVER_VARIANTS: VariantSpec[] = [
  { key: "sm", width: 320, height: 320, quality: 84, fit: "cover", required: true },
  { key: "md", width: 640, height: 640, quality: 84, fit: "cover", required: true },
  { key: "lg", width: 1000, height: 1000, quality: 83, fit: "cover", required: true },
  { key: "xl", width: 1200, height: 1200, quality: 82, fit: "cover", required: true },
];

const AVATAR_VARIANTS: VariantSpec[] = [
  { key: "xs", width: 64, height: 64, quality: 88, fit: "cover", required: true },
  { key: "sm", width: 128, height: 128, quality: 88, fit: "cover", required: true },
  { key: "md", width: 256, height: 256, quality: 87, fit: "cover", required: true },
  { key: "lg", width: 512, height: 512, quality: 86, fit: "cover", required: true },
  { key: "xl", width: 1000, height: 1000, quality: 86, fit: "cover", required: true },
];

const BANNER_VARIANTS: VariantSpec[] = [
  { key: "sm", width: 640, height: 213, quality: 82, fit: "cover", required: true },
  { key: "md", width: 1280, height: 427, quality: 81, fit: "cover", required: true },
  { key: "lg", width: 1920, height: 640, quality: 80, fit: "cover", required: true },
];

const PLAYLIST_VARIANTS: VariantSpec[] = [
  { key: "sm", width: 320, height: 320, quality: 84, fit: "cover", required: true },
  { key: "md", width: 640, height: 640, quality: 84, fit: "cover", required: true },
  { key: "lg", width: 1000, height: 1000, quality: 83, fit: "cover", required: true },
  { key: "xl", width: 1200, height: 1200, quality: 85, fit: "cover", required: true },
];

const DIAGNOSTIC_VARIANTS: VariantSpec[] = [
  { key: "sm", width: 320, height: 320, quality: 82, fit: "inside", required: true },
  { key: "md", width: 640, height: 640, quality: 82, fit: "inside", required: true },
  { key: "lg", width: 800, height: 800, quality: 80, fit: "inside", required: true },
];

export const IMAGE_PROFILES: Record<ImageProfile, ImageProfileConfig> = {
  "product-cover": {
    profile: "product-cover",
    maxUploadBytes: 3 * 1024 * 1024,
    minSourceWidth: 400,
    minSourceHeight: 400,
    requireSquare: false,
    targetAspectRatio: 1,
    aspectTolerance: 0.08,
    variants: SQUARE_COVER_VARIANTS,
    includePlaceholder: true,
    allowUpscale: false,
    storesOriginal: false,
  },
  "track-cover": {
    profile: "track-cover",
    maxUploadBytes: 3 * 1024 * 1024,
    minSourceWidth: 400,
    minSourceHeight: 400,
    requireSquare: false,
    targetAspectRatio: 1,
    aspectTolerance: 0.08,
    variants: SQUARE_COVER_VARIANTS,
    includePlaceholder: true,
    allowUpscale: false,
    storesOriginal: false,
  },
  "author-avatar": {
    profile: "author-avatar",
    maxUploadBytes: 3 * 1024 * 1024,
    requireSquare: true,
    variants: AVATAR_VARIANTS,
    includePlaceholder: false,
    allowUpscale: false,
    storesOriginal: false,
  },
  "user-avatar": {
    profile: "user-avatar",
    maxUploadBytes: 3 * 1024 * 1024,
    requireSquare: true,
    variants: AVATAR_VARIANTS,
    includePlaceholder: false,
    allowUpscale: false,
    storesOriginal: true,
  },
  "author-banner": {
    profile: "author-banner",
    maxUploadBytes: 3 * 1024 * 1024,
    minSourceWidth: 1200,
    minSourceHeight: 400,
    targetAspectRatio: 3,
    aspectTolerance: 0.35,
    variants: BANNER_VARIANTS,
    includePlaceholder: true,
    allowUpscale: false,
    storesOriginal: false,
  },
  "playlist-cover": {
    profile: "playlist-cover",
    maxUploadBytes: 5 * 1024 * 1024,
    minSourceWidth: 320,
    minSourceHeight: 320,
    requireSquare: false,
    targetAspectRatio: 1,
    aspectTolerance: 0.15,
    variants: PLAYLIST_VARIANTS,
    includePlaceholder: true,
    allowUpscale: true,
    storesOriginal: true,
  },
  "diagnostic-image": {
    profile: "diagnostic-image",
    maxUploadBytes: IMAGE_DEFAULT_MAX_UPLOAD_BYTES,
    minSourceWidth: 200,
    minSourceHeight: 200,
    variants: DIAGNOSTIC_VARIANTS,
    includePlaceholder: true,
    allowUpscale: false,
    storesOriginal: false,
  },
};

export function profileStoresOriginal(profile: ImageProfile): boolean {
  return IMAGE_PROFILES[profile].storesOriginal;
}

export function getImageProfileConfig(profile: ImageProfile): ImageProfileConfig {
  return IMAGE_PROFILES[profile];
}

export function getPlaceholderSpec() {
  return {
    width: PLACEHOLDER_SIZE,
    height: PLACEHOLDER_SIZE,
    quality: PLACEHOLDER_QUALITY,
  };
}
