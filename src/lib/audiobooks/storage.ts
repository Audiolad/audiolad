import { AUDIOBOOK_LIMITS } from "./limits";

export const AUDIOBOOK_FRAGMENTS_BUCKET = "audiobook-fragments";
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
  const name = value.trim();
  return name && name.length <= 160 && !/[\\/\u0000-\u001f]/.test(name) && !name.includes("..")
    ? name
    : null;
}

export function audiobookExtensionForMimeType(value: unknown) {
  const mime = normalizeAudiobookMimeType(value);
  return mime ? AUDIOBOOK_EXTENSION_BY_MIME[mime] : null;
}

export function buildAudiobookFragmentStoragePath(authorId: string, projectId: string, chapterId: string, fragmentId: string, mimeType: string) {
  const extension = audiobookExtensionForMimeType(mimeType);
  if (!extension) throw new Error("invalid_audiobook_mime_type");
  return `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}.${extension}`;
}

export function isAudiobookFragmentStoragePath(path: string, authorId: string, projectId: string, chapterId: string, fragmentId: string) {
  return new RegExp(`^audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}\\.(webm|m4a|mp3|wav|aac)$`).test(path);
}
