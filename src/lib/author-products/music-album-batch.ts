import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import { validateMusicMasterFileClient } from "@/lib/author-products/music-master-upload-contract";
import { validateProductAudioFileClient } from "@/lib/author-products/product-audio-upload-contract";
import {
  MUSIC_DELIVERY_UNSUPPORTED_TEXT,
  resolveMusicUploadMode,
} from "@/lib/listen/music-delivery";

export const MAX_MUSIC_ALBUM_BATCH_FILES = 30;

const AUDIO_EXTENSION = /\.(wav|mp3)$/i;
const LEADING_TRACK_NUMBER = /^(\d{1,2})\s*[-–—._]\s*(\S.*)$/;

export type AlbumBatchFile = {
  name: string;
  type?: string | null;
  size: number;
};

export type AlbumBatchSkip = {
  name: string;
  reason: string;
};

export type AlbumBatchPlan<T extends AlbumBatchFile> = {
  accepted: T[];
  skipped: AlbumBatchSkip[];
  overflow: string[];
};

export function deriveAlbumTrackTitle(fileName: string): string {
  const base = fileName.trim().replace(AUDIO_EXTENSION, "").trim();
  const match = LEADING_TRACK_NUMBER.exec(base);
  const title = (match?.[2] ?? base).trim();
  const resolved = title || base;
  return resolved.slice(0, PRODUCT_CONTENT_LIMITS.audioTitle);
}

const USABLE_TRACK_TITLE = /[\p{L}\p{N}]/u;

export function isUsableMusicTrackTitle(title: string | null | undefined): boolean {
  return typeof title === "string" && USABLE_TRACK_TITLE.test(title);
}

export function fallbackMusicTrackTitle(slotNumber: number): string {
  const slot = Number.isInteger(slotNumber) && slotNumber > 0 ? slotNumber : 1;
  return `Аудио ${slot}`;
}

/** Filename title, or «Аудио N» when parsing yields nothing usable. */
export function resolveAlbumTrackTitle(fileName: string, slotNumber: number): string {
  const derived = deriveAlbumTrackTitle(fileName).trim();
  if (!isUsableMusicTrackTitle(derived)) {
    return fallbackMusicTrackTitle(slotNumber);
  }
  return derived;
}

export function leadingAlbumTrackNumber(fileName: string): number | null {
  const base = fileName.trim().replace(AUDIO_EXTENSION, "").trim();
  const match = LEADING_TRACK_NUMBER.exec(base);
  if (!match) {
    return null;
  }
  const trackNumber = Number(match[1]);
  if (!Number.isInteger(trackNumber) || trackNumber < 1 || trackNumber > 99) {
    return null;
  }
  return trackNumber;
}

export function orderAlbumBatchFiles<T extends { name: string }>(files: readonly T[]): T[] {
  const indexed = files.map((file, index) => ({
    file,
    index,
    trackNumber: leadingAlbumTrackNumber(file.name),
  }));
  if (indexed.some((entry) => entry.trackNumber == null)) {
    return files.slice();
  }
  return indexed
    .slice()
    .sort(
      (left, right) =>
        (left.trackNumber ?? 0) - (right.trackNumber ?? 0) || left.index - right.index,
    )
    .map((entry) => entry.file);
}

export function planMusicAlbumBatch<T extends AlbumBatchFile>(
  files: readonly T[],
): AlbumBatchPlan<T> {
  const valid: T[] = [];
  const skipped: AlbumBatchSkip[] = [];

  for (const file of files) {
    const mode = resolveMusicUploadMode(file);
    const reason =
      mode == null
        ? MUSIC_DELIVERY_UNSUPPORTED_TEXT
        : mode === "master"
          ? validateMusicMasterFileClient(file)
          : validateProductAudioFileClient(file);
    if (reason) {
      skipped.push({ name: file.name, reason });
      continue;
    }
    valid.push(file);
  }

  const ordered = orderAlbumBatchFiles(valid);

  return {
    accepted: ordered.slice(0, MAX_MUSIC_ALBUM_BATCH_FILES),
    skipped,
    overflow: ordered.slice(MAX_MUSIC_ALBUM_BATCH_FILES).map((file) => file.name),
  };
}

export function formatAlbumBatchSkipMessage(skipped: readonly AlbumBatchSkip[]): string | null {
  if (skipped.length === 0) {
    return null;
  }
  return skipped.map((entry) => `Пропущен «${entry.name}»: ${entry.reason}`).join(" ");
}

export function formatAlbumBatchOverflowMessage(overflow: readonly string[]): string | null {
  if (overflow.length === 0) {
    return null;
  }
  return `За один раз можно добавить не больше ${MAX_MUSIC_ALBUM_BATCH_FILES} файлов. Не добавлены: ${overflow.join(", ")}.`;
}

export function formatAlbumBatchCreateFailure(
  created: number,
  planned: number,
  fileName: string,
): string {
  return `Добавлено ${created} из ${planned} треков. Не удалось добавить ${fileName}.`;
}

/** New music albums start empty. Every track comes from the album drop zone. */
export function musicAlbumSkipsDefaultAudioItem(input: {
  productKind?: string | null;
  publicationClass?: string | null;
}): boolean {
  return input.productKind === "music" || input.publicationClass === "release";
}

/**
 * A music draft may lose its last track, including a legacy empty «Трек 1» / «Аудио 1».
 * The title and whether a file exists are not part of the decision.
 * A published or unpublished listing keeps at least one track.
 */
export function musicDraftMayDeleteLastTrack(input: {
  productKind?: string | null;
  status?: string | null;
}): boolean {
  return input.productKind === "music" && input.status === "draft";
}
