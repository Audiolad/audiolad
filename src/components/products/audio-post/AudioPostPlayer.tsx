"use client";

import { useProductContentsPlayback } from "@/components/products/useProductContentsPlayback";
import { formatAudioDuration } from "@/lib/products/duration";
import type { PublicAudioItem } from "@/lib/products/public-audio-items";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

type AudioPostPlayerProps = {
  items: PublicAudioItem[];
  authorSlug: string;
  productSlug: string;
  enabled: boolean;
  durationMinutesFallback?: number | null;
  /** `embedded` — CTA inside mobile featured card; `panel` — desktop panel. */
  variant?: "embedded" | "panel";
};

export default function AudioPostPlayer({
  items,
  authorSlug,
  productSlug,
  enabled,
  durationMinutesFallback,
  variant = "panel",
}: AudioPostPlayerProps) {
  const track = [...items].sort((left, right) => left.position - right.position)[0];
  const {
    playTrack,
    loadingTrackId,
    errorMessage,
    clearErrorMessage,
    activeTrackId,
    isPlaying,
    needsGesturePlay,
  } = useProductContentsPlayback({
    authorSlug,
    productSlug,
    enabled,
  });

  if (!track) {
    if (variant === "embedded") {
      return (
        <p className="mt-4 text-sm leading-6 text-[#7d70a2]">Аудио скоро появится</p>
      );
    }

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

  const buttonLabel = !enabled
    ? "Недоступно"
    : isLoading
      ? "Загрузка…"
      : showAsPlaying
        ? "Пауза"
        : PLAY_ACTION_LABEL;

  const playButton = (
    <button
      type="button"
      disabled={!enabled || isLoading}
      aria-label={showAsPlaying ? "Пауза" : PLAY_ACTION_LABEL}
      onClick={() => {
        clearErrorMessage();
        void playTrack(track.id);
      }}
      className={
        variant === "embedded"
          ? "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex min-h-12 min-w-[10.5rem] items-center justify-center gap-2 rounded-[16px] bg-[#7042c5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      <span aria-hidden="true">{showAsPlaying ? "❚❚" : "▶"}</span>
      <span>{buttonLabel}</span>
    </button>
  );

  const statusMessage = errorMessage ? (
    <p
      className={
        variant === "embedded"
          ? "mt-3 text-sm leading-6 text-[#8d4d57]"
          : "mt-3 text-sm leading-6 text-[#8d4d57]"
      }
      role="alert"
    >
      {errorMessage}
    </p>
  ) : showGestureHint ? (
    <p className="mt-3 text-sm leading-6 text-[#8d4d57]" role="status">
      Нажмите ещё раз, чтобы начать прослушивание.
    </p>
  ) : null;

  if (variant === "embedded") {
    return (
      <div className="mt-4">
        {playButton}
        {statusMessage}
      </div>
    );
  }

  return (
    <section className="rounded-[26px] border border-[#eadff8] bg-white px-5 py-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#7d70a2]">Аудио</p>
          {durationLabel ? (
            <p className="mt-1 text-sm text-[#9485b4]">{durationLabel}</p>
          ) : null}
        </div>

        {playButton}
      </div>

      {statusMessage}
    </section>
  );
}
