"use client";

import FormattedPlainText from "@/components/FormattedPlainText";
import ProductContentsTrackCover from "@/components/products/ProductContentsTrackCover";
import { useProductContentsPlayback } from "@/components/products/useProductContentsPlayback";
import { formatAudioDuration } from "@/lib/products/duration";
import {
  resolvePlaybackCoverFields,
  resolvePlaybackCoverUrl,
  type PlaybackCoverPractice,
} from "@/lib/products/cover-display";
import type { PublicAudioItem } from "@/lib/products/public-audio-items";

export type ProductContentsPlaybackConfig = {
  enabled: boolean;
  authorSlug: string;
  productSlug: string;
};

type ProductContentsInteractiveListProps = {
  items: PublicAudioItem[];
  productTitle?: string;
  practiceCover: PlaybackCoverPractice;
  playback: ProductContentsPlaybackConfig;
};

function shouldShowItemDescription(
  description: string | null,
): description is string {
  return typeof description === "string" && description.length > 0;
}

function buildTrackCoverAlt(title: string): string {
  const trimmed = title.trim() || "Без названия";

  return `Обложка аудио «${trimmed}»`;
}

export default function ProductContentsInteractiveList({
  items,
  productTitle,
  practiceCover,
  playback,
}: ProductContentsInteractiveListProps) {
  const {
    playTrack,
    loadingTrackId,
    errorMessage,
    clearErrorMessage,
    activeTrackId,
    enabled,
  } = useProductContentsPlayback(playback);

  const normalizedProductTitle = productTitle?.trim().toLowerCase() ?? "";

  return (
    <>
      <ol className="mt-4 space-y-3">
        {items.map((item, index) => {
          const durationLabel = formatAudioDuration(item.durationSeconds);
          const showDuplicateTitle =
            normalizedProductTitle.length > 0 &&
            item.title.trim().toLowerCase() === normalizedProductTitle;
          const trackCoverFields = resolvePlaybackCoverFields(practiceCover, {
            cover_url: item.coverUrl,
            cover_image: item.coverImage,
            updated_at: item.updatedAt,
          });
          const trackCoverUrl = resolvePlaybackCoverUrl(
            practiceCover,
            {
              cover_url: item.coverUrl,
              cover_image: item.coverImage,
              updated_at: item.updatedAt,
            },
            96,
          );
          const isLoading = loadingTrackId === item.id;
          const isActive = activeTrackId === item.id;
          const cardClassName = [
            "w-full rounded-[18px] border px-4 py-3 text-left transition-colors",
            enabled
              ? "cursor-pointer hover:border-[#dcc9f2] hover:bg-[#f7f2ff] active:bg-[#f1e9fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              : "cursor-default",
            isActive
              ? "border-[#cdb6ea] bg-[#f3ebff] shadow-[0_8px_20px_rgba(112,66,197,0.08)]"
              : "border-[#f0e6fb] bg-[#fcfaff]",
            isLoading ? "opacity-75" : "",
          ].join(" ");

          const cardBody = (
            <>
              <div className="flex items-start gap-3">
                {trackCoverUrl ? (
                  <div className="relative shrink-0">
                    <ProductContentsTrackCover
                      coverUrl={trackCoverFields.coverUrl}
                      coverImage={trackCoverFields.coverImage}
                      updatedAt={trackCoverFields.updatedAt}
                      alt={buildTrackCoverAlt(item.title)}
                    />
                    {enabled && isActive ? (
                      <span className="absolute inset-0 rounded-[14px] ring-2 ring-[#7042c5]/35" />
                    ) : null}
                  </div>
                ) : null}

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[15px] font-medium leading-6 text-[#25135c]">
                      <span className="tabular-nums text-[#8a7ca9]">
                        {index + 1}.
                      </span>{" "}
                      {item.title}
                    </p>

                    <span className="flex shrink-0 items-center gap-2">
                      {isLoading ? (
                        <span className="text-xs text-[#7d70a2]">Запуск…</span>
                      ) : null}
                      {durationLabel ? (
                        <span className="whitespace-nowrap text-sm tabular-nums text-[#7d70a2]">
                          {durationLabel}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>

              {shouldShowItemDescription(item.description) &&
              !showDuplicateTitle ? (
                <FormattedPlainText
                  text={item.description}
                  className="mt-2 text-sm leading-6 text-[#7d70a2]"
                />
              ) : null}
            </>
          );

          return (
            <li key={item.id}>
              {enabled ? (
                <button
                  type="button"
                  className={cardClassName}
                  aria-label={`Слушать: ${item.title}`}
                  aria-busy={isLoading || undefined}
                  aria-current={isActive ? "true" : undefined}
                  disabled={isLoading}
                  onClick={() => {
                    clearErrorMessage();
                    void playTrack(item.id);
                  }}
                >
                  {cardBody}
                </button>
              ) : (
                <div className={cardClassName}>{cardBody}</div>
              )}
            </li>
          );
        })}
      </ol>

      {errorMessage ? (
        <p className="mt-3 text-sm leading-6 text-[#b34f63]" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
