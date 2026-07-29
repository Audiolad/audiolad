/** Centralized MVP limits for listener private audio. */

export const PRIVATE_AUDIO_LIMITS = {
  maxItemsPerUser: 5,
  maxTotalBytesPerUser: 250 * 1024 * 1024,
  maxAudioBytes: 50 * 1024 * 1024,
  maxCoverBytes: 5 * 1024 * 1024,
  titleMaxLength: 120,
  authorTextMaxLength: 120,
  signedUrlTtlSeconds: 900,
  sourceTypes: ["manual_upload"] as const,
} as const;

export type PrivateAudioSourceType =
  (typeof PRIVATE_AUDIO_LIMITS.sourceTypes)[number];

export const PRIVATE_AUDIO_DEFAULT_SOURCE_TYPE: PrivateAudioSourceType =
  "manual_upload";
