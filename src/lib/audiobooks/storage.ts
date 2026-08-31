import { AUDIOBOOK_LIMITS } from "./limits";

export const AUDIOBOOK_FRAGMENTS_BUCKET = "audiobook-fragments";
export function normalizeAudiobookMimeType(value: unknown) {
  if (typeof value !== "string") return null;
  const mime = value.toLowerCase().trim().replace(/^audio\/x-m4a$/, "audio/mp4");
  return AUDIOBOOK_LIMITS.allowedMimeTypes.has(mime) ? mime : null;
}
export function sanitizeAudiobookFilename(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/[^A-Za-zА-Яа-я0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return name && name.length <= 160 && !name.includes("..") ? name : null;
}
export function buildAudiobookFragmentStoragePath(authorId: string, projectId: string, chapterId: string, fragmentId: string, filename: string) {
  return `audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}/${filename}`;
}
export function isAudiobookFragmentStoragePath(path: string, authorId: string, projectId: string, chapterId: string, fragmentId: string) {
  return new RegExp(`^audiobooks/${authorId}/${projectId}/${chapterId}/${fragmentId}/[A-Za-zА-Яа-я0-9._-]+$`).test(path);
}
