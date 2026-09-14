import { MUSIC_STREAMS_BUCKET } from "@/lib/author-products/music-master-upload-contract";

export { MUSIC_STREAMS_BUCKET, MUSIC_MASTERS_BUCKET } from "@/lib/author-products/music-master-upload-contract";

export const MUSIC_TRANSCODE_MAX_ATTEMPTS = 3;
export const MUSIC_TRANSCODE_LEASE_SECONDS = 1800;
export const MUSIC_TRANSCODE_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const MUSIC_TRANSCODE_HEARTBEAT_RETRY_MS = 15_000;
export const MUSIC_TRANSCODE_IDLE_INTERVAL_MS = 5_000;
export const MUSIC_TRANSCODE_LEASE_HOLD_SAFETY_MS = 60_000;
export const MUSIC_TRANSCODE_SHUTDOWN_DRAIN_MS = 90_000;

export const MUSIC_STREAM_PROFILE = "mp3-256";
export const MUSIC_STREAM_FILENAME = "mp3-256.mp3";
export const MUSIC_STREAM_MIME = "audio/mpeg";
export const MUSIC_STREAM_BITRATE_KBPS = 256;
export const MUSIC_STREAM_BITRATE = "256k";

export const MUSIC_STREAM_DURATION_ABS_TOLERANCE_SECONDS = 0.35;
export const MUSIC_STREAM_DURATION_REL_TOLERANCE = 0.05;
export const MUSIC_STREAM_BITRATE_MIN = 240_000;
export const MUSIC_STREAM_BITRATE_MAX = 272_000;

export const MUSIC_TRANSCODE_RETRY_MESSAGE =
  "Не удалось подготовить версию для прослушивания. Попробуем обработать файл повторно.";
export const MUSIC_TRANSCODE_FAILED_MESSAGE =
  "Не удалось подготовить версию для прослушивания.";

export const MUSIC_TRANSCODE_ERROR_CODES = [
  "source_unavailable",
  "source_invalid",
  "transcode_failed",
  "output_invalid",
  "upload_failed",
  "worker_lease_lost",
  "worker_lease_expired",
] as const;

export type MusicTranscodeErrorCode = (typeof MUSIC_TRANSCODE_ERROR_CODES)[number];

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STREAM_PATH = new RegExp(
  `^(${UUID_PATTERN})/(${UUID_PATTERN})/mp3-256\\.mp3$`,
  "i",
);

export function buildMusicStreamStoragePath(
  audioItemId: string,
  sourceAssetId: string,
): string {
  return `${audioItemId}/${sourceAssetId}/${MUSIC_STREAM_FILENAME}`;
}

export function parseMusicStreamStoragePath(storagePath: string): {
  audioItemId: string;
  sourceAssetId: string;
} | null {
  const match = STREAM_PATH.exec(storagePath.trim());
  if (!match) return null;
  return {
    audioItemId: match[1].toLowerCase(),
    sourceAssetId: match[2].toLowerCase(),
  };
}

export function isOwnedMusicStreamStoragePath(
  storagePath: string,
  audioItemId: string,
  sourceAssetId: string,
): boolean {
  const parsed = parseMusicStreamStoragePath(storagePath);
  return (
    parsed !== null
    && parsed.audioItemId === audioItemId.toLowerCase()
    && parsed.sourceAssetId === sourceAssetId.toLowerCase()
  );
}

export function musicStreamOriginalFileName(masterName: string): string {
  const trimmed = masterName.trim();
  if (trimmed.toLowerCase().endsWith(".wav")) {
    return `${trimmed.slice(0, -4)}.mp3`;
  }
  return MUSIC_STREAM_FILENAME;
}

export function classifyMusicTranscodeError(error: unknown): MusicTranscodeErrorCode {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code);
    if ((MUSIC_TRANSCODE_ERROR_CODES as readonly string[]).includes(code)) {
      return code as MusicTranscodeErrorCode;
    }
  }
  if (error instanceof Error) {
    const message = error.message;
    if ((MUSIC_TRANSCODE_ERROR_CODES as readonly string[]).includes(message)) {
      return message as MusicTranscodeErrorCode;
    }
  }
  return "transcode_failed";
}

export function safeMusicTranscodeMessage(permanent: boolean): string {
  return permanent ? MUSIC_TRANSCODE_FAILED_MESSAGE : MUSIC_TRANSCODE_RETRY_MESSAGE;
}

export type MusicStreamAssetLike = {
  id: string;
  audio_item_id: string;
  source_asset_id: string | null;
  asset_role: string;
  storage_bucket: string;
  storage_path: string;
  lifecycle_state: string;
};

export function canReuseVerifiedStreamAsset(
  asset: MusicStreamAssetLike,
  expected: { audioItemId: string; sourceAssetId: string; storagePath: string },
): boolean {
  return (
    asset.asset_role === "stream"
    && asset.lifecycle_state === "verified"
    && asset.storage_bucket === MUSIC_STREAMS_BUCKET
    && asset.source_asset_id === expected.sourceAssetId
    && asset.audio_item_id === expected.audioItemId
    && asset.storage_path === expected.storagePath
  );
}

export function durationWithinTolerance(
  actualSeconds: number,
  sourceSeconds: number,
): boolean {
  if (!(actualSeconds > 0) || !(sourceSeconds > 0)) return false;
  const tolerance = Math.max(
    MUSIC_STREAM_DURATION_ABS_TOLERANCE_SECONDS,
    sourceSeconds * MUSIC_STREAM_DURATION_REL_TOLERANCE,
  );
  return Math.abs(actualSeconds - sourceSeconds) <= tolerance;
}
