import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";

export const PERSONAL_MATERIAL_AUDIO_EXTENSIONS = ["mp3", "m4a"] as const;

export type PersonalMaterialAudioExtension =
  (typeof PERSONAL_MATERIAL_AUDIO_EXTENSIONS)[number];

export type PersonalMaterialAudioMimeType = "audio/mpeg" | "audio/mp4";

export type PersonalMaterialAudioFormat = {
  extension: PersonalMaterialAudioExtension;
  mimeType: PersonalMaterialAudioMimeType;
};

export type PersonalMaterialAudioFileLike = {
  name: string;
  type?: string | null;
  size?: number;
};

export const PERSONAL_MATERIAL_AUDIO_INPUT_ACCEPT =
  ".mp3,.m4a,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/m4a";

const ALLOWED_MP3_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
  "application/octet-stream",
]);

const ALLOWED_M4A_MIME_TYPES = new Set([
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "application/octet-stream",
]);

export function isPersonalMaterialAudioExtension(
  value: string,
): value is PersonalMaterialAudioExtension {
  return value === "mp3" || value === "m4a";
}

function getAudioExtension(filename: string): PersonalMaterialAudioExtension | null {
  const name = filename.trim().toLowerCase();

  if (name.endsWith(".mp3")) {
    return "mp3";
  }

  if (name.endsWith(".m4a")) {
    return "m4a";
  }

  return null;
}

/**
 * Shared client/server format matrix for personal-material audio.
 * Extension and MIME must agree; MIME is never trusted alone.
 */
export function resolvePersonalMaterialAudioFormat(
  file: PersonalMaterialAudioFileLike,
): PersonalMaterialAudioFormat | null {
  const extension = getAudioExtension(file.name);

  if (!extension) {
    return null;
  }

  const mime = file.type?.trim().toLowerCase() ?? "";

  if (extension === "mp3") {
    if (mime && !ALLOWED_MP3_MIME_TYPES.has(mime)) {
      return null;
    }

    return { extension: "mp3", mimeType: "audio/mpeg" };
  }

  if (mime && !ALLOWED_M4A_MIME_TYPES.has(mime)) {
    return null;
  }

  return { extension: "m4a", mimeType: "audio/mp4" };
}

export function isAllowedPersonalMaterialAudioFile(
  file: PersonalMaterialAudioFileLike,
): boolean {
  return resolvePersonalMaterialAudioFormat(file) !== null;
}

export type PersonalMaterialAudioFileIssue =
  | "invalid_file_type"
  | "empty_file"
  | "file_too_large";

export function getPersonalMaterialAudioFileIssue(
  file: PersonalMaterialAudioFileLike,
): PersonalMaterialAudioFileIssue | null {
  if (!resolvePersonalMaterialAudioFormat(file)) {
    return "invalid_file_type";
  }

  const size = file.size ?? 0;

  if (size <= 0) {
    return "empty_file";
  }

  if (size > PERSONAL_MATERIAL_LIMITS.maxAudioBytes) {
    return "file_too_large";
  }

  return null;
}

export function getPersonalMaterialAudioDownloadFallbackFilename(
  audioPath?: string | null,
): string {
  const raw = audioPath?.trim() ?? "";
  const withoutQuery = raw.split("?")[0] ?? "";
  const pathname = withoutQuery.replace(/\\/g, "/");
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1).toLowerCase();

  if (filename.endsWith(".m4a")) {
    return "audio.m4a";
  }

  return "audio.mp3";
}
