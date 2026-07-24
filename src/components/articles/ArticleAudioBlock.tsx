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

function PlayIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
    </svg>
  );
}

function PauseIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M7 5.5h3.2c.4 0 .8.4.8.8v11.4c0 .4-.4.8-.8.8H7c-.4 0-.8-.4-.8-.8V6.3c0-.4.4-.8.8-.8Zm6.8 0H17c.4 0 .8.4.8.8v11.4c0 .4-.4.8-.8.8h-3.2c-.4 0-.8-.4-.8-.8V6.3c0-.4.4-.8.8-.8Z" />
    </svg>
  );
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

  const isPrimary = placement === "top_player";
  const progressRatio =
    isActive && duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  let statusLabel = playLabel;

  if (placement === "final_audio") {
    if (isCompleted && !isActive) {
      statusLabel = "Начать заново";
    } else if (isActive && isPlaying) {
      statusLabel = "Пауза";
    } else if (isActive || playLabel.includes("Продолжить")) {
      statusLabel = "Продолжить";
    } else {
      statusLabel = "Начать слушать";
    }
  } else if (isActive && isPlaying) {
    statusLabel = "Пауза";
  } else if (!isActive && !playLabel.includes("Продолжить")) {
    statusLabel = "Начать слушать";
  }

  const showPauseIcon = isActive && isPlaying;

  function handlePrimaryClick() {
    if (isActive && isPlaying) {
      pause();
      return;
    }

    play(placement);
  }

  const ariaLabel = showPauseIcon
    ? `Пауза: ${title}`
    : isLoading
      ? `Запуск: ${title}`
      : `${statusLabel}: ${title}`;

  return (
    <section
      id={isPrimary ? "article-top-audio" : "article-final-audio"}
      aria-label={
        isPrimary
          ? "Основная аудиопрактика статьи"
          : "Повторное предложение аудиопрактики"
      }
      className={[
        "scroll-mt-[calc(5.5rem+env(safe-area-inset-top,0px))] rounded-[28px] border border-[#dfd0f3] bg-white shadow-[0_10px_28px_rgba(99,61,163,0.08)]",
        isPrimary ? "p-5 sm:p-6" : "p-4 sm:p-5",
      ].join(" ")}
    >
      <div className={`flex ${isPrimary ? "gap-4 sm:gap-5" : "gap-3.5"}`}>
        <div
          className={[
            "aspect-square shrink-0 overflow-hidden rounded-[20px] bg-[#f4ecfb]",
            isPrimary ? "w-[112px] sm:w-[128px]" : "w-[96px] sm:w-[108px]",
          ].join(" ")}
        >
          <ProductCoverThumbnail
            slug={product.slug}
            title={product.title}
            coverUrl={product.coverUrl}
            coverImage={product.coverImage}
            updatedAt={product.updatedAt}
            authorName={product.authorName}
            format={product.format}
            className="aspect-square w-full rounded-[20px]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7d70a2]">
            Аудиопрактика
          </p>
          <h3
            className={[
              "mt-1.5 font-semibold leading-snug text-[#25135c]",
              isPrimary ? "text-[1.15rem] sm:text-xl" : "text-lg sm:text-[1.15rem]",
            ].join(" ")}
          >
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
            <p className="mt-1.5 text-sm text-[#7d70a2]">{authorName}</p>
          ) : null}
          <p className="mt-2 text-sm font-medium text-[#4a3d73]">
            {[accessLabel, durationLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className={`mt-5 flex flex-wrap items-center ${isPrimary ? "gap-3" : "gap-2.5"}`}>
        <button
          type="button"
          onClick={handlePrimaryClick}
          disabled={isLoading}
          aria-label={ariaLabel}
          aria-pressed={showPauseIcon}
          className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#7042c5] py-1.5 pl-1.5 pr-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(112,66,197,0.28)] hover:bg-[#6338b0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/18">
            {isLoading ? (
              <span className="text-xs font-semibold">…</span>
            ) : showPauseIcon ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </span>
          <span>{isLoading ? "Запуск…" : statusLabel}</span>
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
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#c6afe6] bg-white px-4 py-2 text-sm font-semibold text-[#7042c5] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-60"
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
              className="h-full rounded-full bg-[#7042c5] transition-[width] duration-200 motion-reduce:transition-none"
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
