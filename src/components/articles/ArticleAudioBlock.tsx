"use client";

import Link from "next/link";

import LibraryAddButton from "@/components/LibraryAddButton";
import {
  useArticlePlayback,
  type ArticleAudioPlacement,
} from "@/components/articles/ArticlePlaybackProvider";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { CatalogProduct } from "@/lib/products/catalog";
import type { PracticeLibraryAction } from "@/lib/products/practice-access-ui";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type ArticleAudioBlockProps = {
  placement: Extract<ArticleAudioPlacement, "top_player" | "final_audio">;
  product: CatalogProduct;
  accessLabel: string;
  libraryAction: PracticeLibraryAction;
  signInReturnPath: string;
};

export default function ArticleAudioBlock({
  placement,
  product,
  accessLabel,
  libraryAction,
  signInReturnPath,
}: ArticleAudioBlockProps) {
  const title = product.title;
  const authorName = product.authorName;
  const href = product.href;
  const durationLabel = product.statsLabel;
  const {
    practiceId,
    practiceSlug,
    isPlaying,
    isLoading,
    isActive,
    playLabel,
    errorMessage,
    currentTime,
    duration,
    playbackRate,
    isCompleted,
    play,
    pause,
    seekBy,
    cycleSpeed,
    trackEvent,
  } = useArticlePlayback();

  const progressRatio =
    isActive && duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  let primaryLabel = playLabel;

  if (placement === "final_audio") {
    if (isCompleted && !isActive) {
      primaryLabel = "Начать заново";
    } else if (isActive && isPlaying) {
      primaryLabel = "Пауза";
    } else if (isActive || playLabel.includes("Продолжить")) {
      primaryLabel = "Продолжить";
    } else {
      primaryLabel = "Включить";
    }
  } else if (isActive && isPlaying) {
    primaryLabel = "Пауза";
  }

  function handlePrimaryClick() {
    if (isActive && isPlaying) {
      pause();
      return;
    }

    play(placement);
  }

  return (
    <section
      id={placement === "top_player" ? "article-top-audio" : "article-final-audio"}
      aria-label={
        placement === "top_player"
          ? "Основная аудиопрактика статьи"
          : "Повторное предложение аудиопрактики"
      }
      className="scroll-mt-[calc(5.5rem+env(safe-area-inset-top,0px))] rounded-[24px] border border-[#e8def5] bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex gap-4">
        <div className="aspect-square w-[96px] shrink-0 sm:w-[112px]">
          <ProductCoverThumbnail
            slug={product.slug}
            title={product.title}
            coverUrl={product.coverUrl}
            coverImage={product.coverImage}
            updatedAt={product.updatedAt}
            authorName={product.authorName}
            format={product.format}
            className="aspect-square w-full rounded-[18px]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-[#7d70a2]">
            Аудиопрактика
          </p>
          <h3 className="mt-1 text-lg font-semibold leading-snug text-[#25135c] sm:text-xl">
            <Link
              href={href}
              className="hover:text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              onClick={() =>
                trackEvent("article_practice_open", { placement })
              }
            >
              {title}
            </Link>
          </h3>
          {authorName ? (
            <p className="mt-1 text-sm text-[#7d70a2]">{authorName}</p>
          ) : null}
          <p className="mt-2 text-sm text-[#4a3d73]">
            {[accessLabel, durationLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePrimaryClick}
          disabled={isLoading}
          aria-label={
            isActive && isPlaying
              ? "Пауза"
              : primaryLabel === "Пауза"
                ? "Пауза"
                : `Воспроизвести: ${title}`
          }
          aria-pressed={isActive && isPlaying}
          className="inline-flex min-h-11 min-w-[8.5rem] items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
        >
          {isLoading ? "Запуск…" : primaryLabel}
        </button>

        {placement === "final_audio" && !isActive ? (
          <a
            href="#article-top-audio"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            onClick={() =>
              trackEvent("article_final_audio_click", {
                placement: "final_audio",
                action: "jump_to_top",
              })
            }
          >
            К плееру выше
          </a>
        ) : null}

        {libraryAction !== "hidden" ? (
          <LibraryAddButton
            practiceSlug={practiceSlug}
            practiceId={practiceId}
            signInReturnPath={signInReturnPath}
            action={libraryAction}
            onClaimSuccess={() =>
              trackEvent("article_practice_save", { placement })
            }
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
          />
        ) : null}
      </div>

      {isActive ? (
        <div className="mt-4 space-y-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[#eadff8]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressRatio * 100)}
            aria-label="Прогресс прослушивания"
          >
            <div
              className="h-full rounded-full bg-[#7042c5] transition-[width] duration-200"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#7d70a2]">
            <span>
              {formatClock(currentTime)} / {formatClock(duration)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => seekBy(-15)}
                aria-label="Назад на 15 секунд"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#e8def5] px-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                −15
              </button>
              <button
                type="button"
                onClick={() => seekBy(15)}
                aria-label="Вперёд на 15 секунд"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#e8def5] px-2 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                +15
              </button>
              <button
                type="button"
                onClick={cycleSpeed}
                aria-label={`Скорость воспроизведения ${playbackRate}×`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#e8def5] px-3 text-sm font-semibold text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                {playbackRate}×
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-[16px] border border-[#f2d4d8] bg-[#fff7f8] px-4 py-3 text-sm text-[#8d4d57]"
        >
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
