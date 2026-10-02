import { MUSIC_ANALYZER_MAX_UPLOAD_BYTES } from "./constants";

export type MusicAnalyzerMime = "audio/wav" | "audio/mpeg";

export function safeAudioFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "audio";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "audio";
}

export function normalizeAudioMime(filename: string, mime: string): MusicAnalyzerMime | null {
  const name = filename.trim().toLowerCase();
  const type = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  const octet = type === "" || type === "application/octet-stream";
  const wavMime = type === "audio/wav" || type === "audio/x-wav" || type === "audio/wave" || type === "audio/vnd.wave";
  const mp3Mime = type === "audio/mpeg" || type === "audio/mp3" || type === "audio/x-mpeg";
  if (wavMime || (octet && name.endsWith(".wav"))) return "audio/wav";
  if (mp3Mime || (octet && name.endsWith(".mp3"))) return "audio/mpeg";
  if (name.endsWith(".wav") && !mp3Mime) return "audio/wav";
  if (name.endsWith(".mp3") && !wavMime) return "audio/mpeg";
  return null;
}

export function displayFilename(name: string): string | null {
  const trimmed = name.trim().slice(0, 180);
  if (!trimmed || /[\u0000-\u001f]/.test(trimmed) || trimmed.includes("/") || trimmed.includes("\\")) {
    return null;
  }
  return trimmed;
}

export function validateUploadDescriptor(input: {
  filename: string;
  byteSize: number;
  mime: string;
}): { filename: string; mime: MusicAnalyzerMime } | { error: "file_type" | "file_too_large" | "file_required" } {
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { error: "file_required" };
  }
  if (input.byteSize > MUSIC_ANALYZER_MAX_UPLOAD_BYTES) {
    return { error: "file_too_large" };
  }
  const filename = displayFilename(input.filename);
  const mime = normalizeAudioMime(input.filename, input.mime);
  if (!filename || !mime) return { error: "file_type" };
  return { filename, mime };
}

export function buildRunStoragePath(runId: string, filename: string): string {
  return `runs/${runId}/${safeAudioFilename(filename)}`;
}

export function audioLooksLikeWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const riff = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  const wave = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
  return riff === "RIFF" && wave === "WAVE";
}
