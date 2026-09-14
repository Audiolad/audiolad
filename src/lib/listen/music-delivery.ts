import { MUSIC_STREAMS_BUCKET } from "@/lib/author-products/music-master-upload-contract";

export const PRACTICE_AUDIO_BUCKET = "practice-audio";

export const MUSIC_DELIVERY_UPLOAD_HINT =
  "Поддерживаются WAV и MP3. Предпочтительный формат — WAV: мы автоматически подготовим версию для прослушивания.";

export const MUSIC_DELIVERY_EMPTY_TEXT = "Аудио ещё не загружено";
export const MUSIC_DELIVERY_UPLOAD_LABEL = "Загрузить аудио";
export const MUSIC_DELIVERY_REPLACE_LABEL = "Заменить аудио";
export const MUSIC_DELIVERY_PREPARING_TEXT =
  "Аудио загружено. Подготавливаем версию для прослушивания…";
export const MUSIC_DELIVERY_PREPARING_WITH_CURRENT_TEXT =
  "Новая версия обрабатывается. Текущая версия доступна для прослушивания.";
export const MUSIC_DELIVERY_READY_TEXT = "Аудио готово к прослушиванию";
export const MUSIC_DELIVERY_FAILED_TEXT =
  "Не удалось подготовить версию для прослушивания. Загрузите файл ещё раз.";
export const MUSIC_DELIVERY_UNSUPPORTED_TEXT =
  "Загрузите аудио в формате WAV или MP3.";

export type MusicListenSource =
  | { kind: "stream"; bucket: typeof MUSIC_STREAMS_BUCKET; path: string }
  | { kind: "legacy"; bucket: typeof PRACTICE_AUDIO_BUCKET; path: string }
  | { kind: "missing" };

export type MusicStreamCandidate = {
  audioItemId: string;
  assetRole: string;
  lifecycleState: string;
  storageBucket: string;
  storagePath: string;
};

export function isVerifiedMusicStreamAsset(
  candidate: MusicStreamCandidate | null | undefined,
  audioItemId: string,
): candidate is MusicStreamCandidate {
  return Boolean(
    candidate
      && candidate.audioItemId === audioItemId
      && candidate.assetRole === "stream"
      && candidate.lifecycleState === "verified"
      && candidate.storageBucket === MUSIC_STREAMS_BUCKET
      && candidate.storagePath.trim(),
  );
}

export function resolveMusicListenSource(input: {
  productKind: string;
  audioItemId: string;
  audioPath: string | null | undefined;
  activeStream: MusicStreamCandidate | null | undefined;
}): MusicListenSource {
  const audioPath = input.audioPath?.trim() || null;
  if (input.productKind === "music" && isVerifiedMusicStreamAsset(input.activeStream, input.audioItemId)) {
    return {
      kind: "stream",
      bucket: MUSIC_STREAMS_BUCKET,
      path: input.activeStream.storagePath,
    };
  }
  if (audioPath) {
    return { kind: "legacy", bucket: PRACTICE_AUDIO_BUCKET, path: audioPath };
  }
  return { kind: "missing" };
}

export function resolveMusicCatalogPreviewMode(input: {
  productKind: string;
  audioItemId: string;
  audioPath: string | null | undefined;
  activeStream: MusicStreamCandidate | null | undefined;
}): "clip" | MusicListenSource {
  const audioPath = input.audioPath?.trim() || null;
  if (audioPath) {
    return "clip";
  }
  return resolveMusicListenSource({
    productKind: input.productKind,
    audioItemId: input.audioItemId,
    audioPath: null,
    activeStream: input.activeStream,
  });
}

export function isMusicWavUploadFile(file: { name: string; type?: string | null }): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".wav") || type.includes("wav") || type.includes("wave");
}

export function isMusicMp3UploadFile(file: { name: string; type?: string | null }): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".mp3") || type === "audio/mpeg" || type === "audio/mp3";
}

export function resolveMusicUploadMode(file: { name: string; type?: string | null }): "master" | "legacy" | null {
  if (isMusicWavUploadFile(file)) return "master";
  if (isMusicMp3UploadFile(file)) return "legacy";
  return null;
}

export type MusicCabinetStatus = {
  kind: "empty" | "preparing" | "preparing_with_current" | "ready" | "failed" | "uploading" | "rejected";
  text: string;
};

export function hasPlayableAuthorAudioPreview(input: {
  audioPath?: string | null;
  activeMusicDeliveryAssetId?: string | null;
  hasActiveDelivery?: boolean | null;
}): boolean {
  return Boolean(
    input.audioPath?.trim()
      || input.activeMusicDeliveryAssetId
      || input.hasActiveDelivery,
  );
}

export function musicCabinetStatus(input: {
  hasLegacyAudioPath: boolean;
  hasActiveDelivery: boolean;
  lifecycleState: string | null | undefined;
  transcodeStatus: string | null | undefined;
}): MusicCabinetStatus {
  const processing = ["queued", "processing"].includes(input.transcodeStatus ?? "");
  const hasPlayable = Boolean(input.hasActiveDelivery || input.hasLegacyAudioPath);
  if (input.lifecycleState === "uploading") {
    return { kind: "uploading", text: MUSIC_DELIVERY_PREPARING_TEXT };
  }
  if (input.lifecycleState === "rejected") {
    return { kind: "rejected", text: MUSIC_DELIVERY_FAILED_TEXT };
  }
  if (processing && hasPlayable) {
    return { kind: "preparing_with_current", text: MUSIC_DELIVERY_PREPARING_WITH_CURRENT_TEXT };
  }
  if (processing) {
    return { kind: "preparing", text: MUSIC_DELIVERY_PREPARING_TEXT };
  }
  if (input.transcodeStatus === "failed") {
    return { kind: "failed", text: MUSIC_DELIVERY_FAILED_TEXT };
  }
  // Job "ready" alone is not a playable source — wait until active delivery or audio_path exists.
  if (input.transcodeStatus === "ready" && !hasPlayable) {
    return { kind: "preparing", text: MUSIC_DELIVERY_PREPARING_TEXT };
  }
  if (hasPlayable) {
    return { kind: "ready", text: MUSIC_DELIVERY_READY_TEXT };
  }
  return { kind: "empty", text: MUSIC_DELIVERY_EMPTY_TEXT };
}
