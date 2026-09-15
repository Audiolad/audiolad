import type { ProductNormalizeSourceFormat } from "./contract";

export type ProductSourceProbe = {
  formatNames: string[];
  durationSeconds: number | null;
  hasAudioStream: boolean;
  hasVideoStream: boolean;
  audioCodecNames: string[];
};

const M4A_CONTAINERS = new Set(["mp4", "mov", "m4a", "isom"]);
const AAC_CODECS = new Set(["aac", "mp4a"]);
const AAC_CONTAINERS = new Set(["aac", "adts"]);

export type ProductSourceValidationCode =
  | "ok"
  | "unreadable"
  | "no_audio"
  | "has_video"
  | "invalid_duration"
  | "container_mismatch"
  | "codec_mismatch";

export function validateProductSourceProbe(
  format: ProductNormalizeSourceFormat,
  probe: ProductSourceProbe | null,
): ProductSourceValidationCode {
  if (!probe) return "unreadable";
  if (!probe.hasAudioStream) return "no_audio";
  if (probe.hasVideoStream) return "has_video";
  if (probe.durationSeconds == null || !(probe.durationSeconds > 0)) {
    return "invalid_duration";
  }

  const formats = new Set(probe.formatNames);
  const codecs = new Set(probe.audioCodecNames);

  if (format === "m4a") {
    const containerOk = [...M4A_CONTAINERS].some((name) => formats.has(name));
    if (!containerOk) return "container_mismatch";
    // Reject WAV/MP3 renamed to .m4a
    if (formats.has("wav") || formats.has("wave") || formats.has("mp3")) {
      return "container_mismatch";
    }
    const codecOk = [...AAC_CODECS].some((name) => codecs.has(name));
    if (!codecOk) return "codec_mismatch";
    return "ok";
  }

  // raw .aac — ADTS / AAC elementary only (MP4/MOV under .aac is reject).
  const hasM4aFamily = [...M4A_CONTAINERS].some((name) => formats.has(name));
  if (hasM4aFamily) return "container_mismatch";
  const containerOk = [...AAC_CONTAINERS].some((name) => formats.has(name));
  if (!containerOk) return "container_mismatch";
  if (formats.has("wav") || formats.has("wave") || formats.has("mp3")) {
    return "container_mismatch";
  }
  const codecOk = [...AAC_CODECS].some((name) => codecs.has(name));
  if (!codecOk) return "codec_mismatch";
  return "ok";
}

export function isValidProductDeliveryMp3Probe(
  probe: ProductSourceProbe | null,
  sourceDurationSeconds: number,
  durationWithinTolerance: (a: number, b: number) => boolean,
): boolean {
  if (!probe || probe.durationSeconds == null) return false;
  const mp3Container = probe.formatNames.some(
    (name) => name === "mp3" || name === "mp3float",
  );
  if (!mp3Container) return false;
  if (!probe.hasAudioStream || probe.hasVideoStream) return false;
  if (!probe.audioCodecNames.includes("mp3")) return false;
  if (probe.formatNames.includes("wav") || probe.formatNames.includes("wave")) {
    return false;
  }
  return durationWithinTolerance(probe.durationSeconds, sourceDurationSeconds);
}
