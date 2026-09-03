import { AUDIOBOOK_LIMITS } from "./limits";

export const AUDIOBOOK_FRAGMENTS_BUCKET = "audiobook-fragments";
export const AUDIOBOOK_RENDERS_BUCKET = "audiobook-renders";
export function normalizeAudiobookMimeType(value: unknown) {
  if (typeof value !== "string") return null;
  const mime = value.split(";", 1)[0].toLowerCase().trim().replace(/^audio\/x-m4a$/, "audio/mp4");
  return AUDIOBOOK_LIMITS.allowedMimeTypes.has(mime) ? mime : null;
}

const AUDIOBOOK_EXTENSION_BY_MIME = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
} as const;

export function validateAudiobookOriginalFilename(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/[^A-Za-zА-Яа-я0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return name && name.length <= 160 && !name.includes("..")
    ? name
    : null;
}

export function audiobookExtensionForMimeType(value: unknown) {
  const mime = normalizeAudiobookMimeType(value);
  if (!mime) return null;
  switch (mime) {
    case "audio/webm": return AUDIOBOOK_EXTENSION_BY_MIME["audio/webm"];
    case "audio/mp4": return AUDIOBOOK_EXTENSION_BY_MIME["audio/mp4"];
    case "audio/mpeg": return AUDIOBOOK_EXTENSION_BY_MIME["audio/mpeg"];
    case "audio/wav": return AUDIOBOOK_EXTENSION_BY_MIME["audio/wav"];
    case "audio/x-wav": return AUDIOBOOK_EXTENSION_BY_MIME["audio/x-wav"];
    case "audio/aac": return AUDIOBOOK_EXTENSION_BY_MIME["audio/aac"];
    default: return null;
  }
}

export function buildAudiobookFragmentStoragePath(authorId: string, projectId: string, chapterId: string, fragmentId: string, mimeType: string) {
  const extension = audiobookExtensionForMimeType(mimeType);
  if (!extension) throw new Error("invalid_audiobook_mime_type");
  return `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}.${extension}`;
}

export function isAudiobookFragmentStoragePath(path: string, authorId: string, projectId: string, chapterId: string, fragmentId: string) {
  return new RegExp(`^audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}\\.(webm|m4a|mp3|wav|aac)$`).test(path);
}

/**
 * Playback accepts only the current flat ASCII key or a legacy key created by
 * the original fragment reservation flow. Callers must additionally require
 * the fragment to be active before exposing a signed URL.
 */
export function isAudiobookActiveFragmentStoragePath(
  path: string,
  authorId: string,
  projectId: string,
  chapterId: string,
  fragmentId: string,
) {
  if (isAudiobookFragmentStoragePath(path, authorId, projectId, chapterId, fragmentId)) {
    return true;
  }

  return new RegExp(
    `^audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}/[A-Za-zА-Яа-я0-9._-]+$`,
  ).test(path);
}

export function buildAudiobookChapterRenderStoragePath(authorId: string, projectId: string, chapterId: string, jobId: string) {
  return `audiobooks/${authorId}/${projectId}/${chapterId}/renders/${jobId}.mp3`;
}
