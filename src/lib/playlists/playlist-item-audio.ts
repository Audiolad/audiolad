import {
  mapProductCoverFields,
  resolvePlaybackCoverFields,
  type ProductCoverFields,
} from "@/lib/products/cover-display";
import {
  formatAudioDuration,
  formatCatalogProductStats,
  formatProductDuration,
} from "@/lib/products/duration";
import type { PublishedAudioItemDetail } from "@/lib/products/public-audio-items";

type PracticeCoverInput = {
  title?: string | null;
  cover_url?: string | null;
  cover_image?: unknown;
  updated_at?: string | null;
  duration_minutes?: number | null;
};

export function playlistItemAudioMap(
  items: ReadonlyArray<PublishedAudioItemDetail>,
): Map<string, PublishedAudioItemDetail> {
  return new Map(items.map((item) => [item.id, item]));
}

export function resolvePlaylistItemPresentation(input: {
  practice: PracticeCoverInput;
  audioItem?: PublishedAudioItemDetail | null;
  audioCount: number;
  totalDurationSeconds: number | null;
}): {
  title: string;
  cover: ProductCoverFields;
  durationSeconds: number | null;
  durationLabel: string | null;
  metaLabel: string | null;
} {
  const audioItem = input.audioItem ?? null;
  const productTitle = input.practice.title?.trim() || "Без названия";

  if (audioItem) {
    return {
      title: audioItem.title || productTitle,
      cover: resolvePlaybackCoverFields(input.practice, {
        cover_url: audioItem.coverUrl,
        cover_image: audioItem.coverImage,
        updated_at: audioItem.updatedAt,
      }),
      durationSeconds: audioItem.durationSeconds,
      durationLabel:
        formatAudioDuration(audioItem.durationSeconds) ??
        formatProductDuration(audioItem.durationSeconds),
      metaLabel: formatAudioDuration(audioItem.durationSeconds),
    };
  }

  return {
    title: productTitle,
    cover: mapProductCoverFields(input.practice),
    durationSeconds:
      input.totalDurationSeconds && input.totalDurationSeconds > 0
        ? input.totalDurationSeconds
        : typeof input.practice.duration_minutes === "number" &&
            input.practice.duration_minutes > 0
          ? Math.round(input.practice.duration_minutes * 60)
          : null,
    durationLabel: formatProductDuration(
      input.totalDurationSeconds,
      input.practice.duration_minutes,
    ),
    metaLabel: formatCatalogProductStats({
      audioCount: input.audioCount,
      totalDurationSeconds: input.totalDurationSeconds,
      durationMinutesFallback: input.practice.duration_minutes,
    }),
  };
}
