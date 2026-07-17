"use client";

import Link from "next/link";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import {
  buildAuthorPublicPath,
  buildListenPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#f3ebfc] text-2xl text-[#7042c5]"
        aria-hidden="true"
      >
        ♫
      </div>
      <p className="mt-5 text-[15px] leading-6 text-[#796ba0]">
        Выберите практику, чтобы начать слушать
      </p>
    </div>
  );
}

export default function NowPlayingPanel() {
  const { session } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();

  const hasSession = Boolean(session?.tracks.length);
  const isEngineReady = Boolean(engine);

  if (!hasSession || !session) {
    return (
      <aside
        className="flex h-full min-h-0 w-[var(--listener-now-playing-width)] shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fffdfd] shadow-[0_8px_24px_rgba(90,60,145,0.06)]"
        aria-label="Сейчас играет"
      >
        <div className="shrink-0 border-b border-[#f0e8f8] px-5 py-4">
          <h2 className="text-[17px] font-semibold text-[#25135c]">
            Сейчас играет
          </h2>
        </div>
        <EmptyState />
      </aside>
    );
  }

  const {
    practiceTitle,
    authorName,
    authorSlug,
    productSlug,
    tracks,
    coverImageUrl,
    coverSymbol,
    coverGradient,
  } = session;

  const currentTrack =
    isEngineReady && engine?.currentTrack
      ? engine.currentTrack
      : (tracks[0] ?? null);
  const currentTrackIndex =
    isEngineReady && engine ? engine.currentTrackIndex : 0;
  const isMultiTrack = tracks.length > 1;
  const displayDuration =
    isEngineReady && engine && engine.displayDuration > 0
      ? engine.displayDuration
      : (currentTrack?.durationSeconds ?? 0);
  const currentTime = isEngineReady && engine ? engine.currentTime : 0;
  const programProgressPercent =
    isEngineReady && engine ? engine.programProgressPercent : 0;

  const title =
    currentTrack?.title?.trim() || practiceTitle.trim() || "Без названия";
  const activeCoverUrl = currentTrack?.coverImageUrl ?? coverImageUrl;
  const description = currentTrack?.description?.trim() ?? "";

  const nextTrack = tracks[currentTrackIndex + 1] ?? null;

  const listenHref =
    authorSlug && productSlug
      ? buildListenPath(authorSlug, productSlug)
      : null;
  const practiceHref =
    authorSlug && productSlug
      ? buildPracticePublicPath(authorSlug, productSlug)
      : null;
  const authorHref = authorSlug ? buildAuthorPublicPath(authorSlug) : null;

  return (
    <aside
      className="flex h-full min-h-0 w-[var(--listener-now-playing-width)] shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-[#fffdfd] shadow-[0_8px_24px_rgba(90,60,145,0.06)]"
      aria-label="Сейчас играет"
    >
      <div className="shrink-0 border-b border-[#f0e8f8] px-5 py-4">
        <h2 className="text-[17px] font-semibold text-[#25135c]">
          Сейчас играет
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto w-full max-w-[280px]">
          <div className="overflow-hidden rounded-[18px] border border-[#f0e8f8] bg-[#faf6ff] shadow-sm">
            {activeCoverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeCoverUrl}
                alt=""
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div
                className={`flex aspect-square w-full items-center justify-center bg-gradient-to-br ${coverGradient} text-5xl text-white/90`}
                aria-hidden="true"
              >
                {coverSymbol}
              </div>
            )}
          </div>

          <h3 className="mt-4 text-[20px] font-semibold leading-snug text-[#25135c]">
            {title}
          </h3>

          {authorName ? (
            authorHref ? (
              <Link
                href={authorHref}
                className="mt-2 inline-block text-[15px] font-medium text-[#7042c5] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                {authorName}
              </Link>
            ) : (
              <p className="mt-2 text-[15px] font-medium text-[#7042c5]">
                {authorName}
              </p>
            )
          ) : null}

          {displayDuration > 0 ? (
            <p className="mt-2 text-sm text-[#796ba0]">
              {formatTime(currentTime)} / {formatTime(displayDuration)}
            </p>
          ) : null}

          {isMultiTrack ? (
            <p className="mt-2 text-sm text-[#796ba0]">
              Шаг {currentTrackIndex + 1} из {tracks.length}
              {programProgressPercent > 0
                ? ` · ${Math.round(programProgressPercent)}%`
                : null}
            </p>
          ) : null}

          {description ? (
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-[#796ba0]">
              {description}
            </p>
          ) : null}

          {nextTrack ? (
            <div className="mt-5 rounded-[16px] border border-[#f0e8f8] bg-[#faf6ff] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9485b4]">
                Далее
              </p>
              <p className="mt-1 text-sm font-medium leading-snug text-[#25135c]">
                {nextTrack.title}
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2">
            {listenHref ? (
              <Link
                href={listenHref}
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6234b5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Открыть плеер
              </Link>
            ) : null}
            {practiceHref ? (
              <Link
                href={practiceHref}
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#dcc9f2] px-4 py-2 text-sm font-medium text-[#7042c5] transition hover:bg-[#faf6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                Страница практики
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
