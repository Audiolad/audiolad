export const AUDIOBOOK_LIMITS = {
  maxFragmentBytes: 200 * 1024 * 1024,
  maxProjectSourceBytes: 5 * 1024 * 1024 * 1024,
  signedUploadTtlSeconds: 10 * 60,
  allowedMimeTypes: new Set([
    "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac",
  ]),
} as const;
