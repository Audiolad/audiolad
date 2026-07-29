import type { PrivateAudioGlobalPlayerSession } from "@/lib/listen/global-player-types";
import type { PrivateAudioDetailDto } from "@/lib/private-audio/types";

const PRIVATE_COVER_GRADIENT = "from-[#7c5cbf] via-[#7042c5] to-[#4b2f86]";

export function buildPrivateAudioDetailPath(itemId: string): string {
  return `/my-library/private-audio/${encodeURIComponent(itemId)}`;
}

export function buildPrivateAudioGlobalSession(
  item: PrivateAudioDetailDto,
  options?: {
    requestAutoplay?: boolean;
    forceStartAtBeginning?: boolean;
  },
): PrivateAudioGlobalPlayerSession {
  const title = item.title.trim() || "Аудиоматериал";
  const authorText = item.authorText?.trim() || null;
  const durationSeconds =
    typeof item.durationSeconds === "number" && item.durationSeconds > 0
      ? item.durationSeconds
      : item.progress.durationSeconds && item.progress.durationSeconds > 0
        ? item.progress.durationSeconds
        : null;

  return {
    sourceType: "private_audio",
    itemId: item.id,
    detailPath: buildPrivateAudioDetailPath(item.id),
    practiceTitle: title,
    authorName: authorText ?? "",
    authorText,
    format: null,
    tracks: [
      {
        id: item.id,
        title,
        description: null,
        position: 1,
        durationSeconds,
        coverImageUrl: item.coverUrl,
      },
    ],
    initialProgress: [
      {
        audioItemId: item.id,
        positionSeconds: item.progress.positionSeconds,
        completed: item.progress.completed,
      },
    ],
    coverSymbol: title.charAt(0).toUpperCase() || "А",
    coverGradient: PRIVATE_COVER_GRADIENT,
    coverImageUrl: item.coverUrl,
    isAuthorPreview: false,
    requestAutoplay: options?.requestAutoplay,
    forceStartAtBeginning: options?.forceStartAtBeginning,
    initialTrackId: item.id,
    suppressListenUrlSync: true,
  };
}
