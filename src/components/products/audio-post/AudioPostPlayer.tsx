"use client";

import { useEffect } from "react";

import { useProductContentsPlayback } from "@/components/products/useProductContentsPlayback";
import { formatAudioDuration } from "@/lib/products/duration";
import type { PublicAudioItem } from "@/lib/products/public-audio-items";

type AudioPostPlayerProps = {
  items: PublicAudioItem[];
  authorSlug: string;
  productSlug: string;
  enabled: boolean;
  durationMinutesFallback?: number | null;
};

export default function AudioPostPlayer({
  items,
  authorSlug,
  productSlug,
  enabled,
  durationMinutesFallback,
}: AudioPostPlayerProps) {
  const track = [...items].sort((left, right) => left.position - right.position)[0];
  const {
    playTrack,
    loadingTrackId,
    errorMessage,
    clearErrorMessage,
    activeTrackId,
    isPlaying,
  } = useProductContentsPlayback({
    authorSlug,
    productSlug,
    enabled,
  });

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearErrorMessage();
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [clearErrorMessage, errorMessage]);

  if (!track) {
    return (
      <section className="rounded-[26px] border border-[#eadff8] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
        <p className="text-sm leading-6 text-[#7d70a2]">Аудио скоро появится</p>
      </section>
    );
  }

  const durationLabel =
    formatAudioDuration(track.durationSeconds) ||
    (typeof durationMinutesFallback === "number" && durationMinutesFallback > 0
      ? `${durationMinutesFallback} мин`
      : null);
  const isLoading = loadingTrackId === track.id;
  const isCurrentTrack = activeTrackId === track.id;
  const showAsPlaying = isCurrentTrack && isPlaying;

  return (
    <section className="rounded-[26px] border border-[#eadff8] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#7d70a2]">Аудио</p>
          {durationLabel ? (
            <p className="mt-1 text-sm text-[#9485b4]">{durationLabel}</p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={!enabled || isLoading}
          aria-label={showAsPlaying ? "Пауза" : "Воспроизвести"}
          onClick={() => {
            void playTrack(track.id);
          }}
          className="inline-flex min-h-12 min-w-[10.5rem] items-center justify-center gap-2 rounded-[16px] bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true">{showAsPlaying ? "❚❚" : "▶"}</span>
          <span>
            {!enabled
              ? "Недоступно"
              : isLoading
                ? "Загрузка…"
                : showAsPlaying
                  ? "Пауза"
                  : "Слушать"}
          </span>
        </button>
      </div>

      {errorMessage ? (
        <p className="mt-3 text-sm leading-6 text-[#8d4d57]" role="alert">
          {errorMessage}
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
          Воспроизведение откроется в плеере АудиоЛада на этой же странице.
        </p>
      )}
    </section>
  );
}
