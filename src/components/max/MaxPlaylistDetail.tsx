"use client";

import { useEffect, useRef, useState } from "react";

import { FEATURED_CARD_PRIMARY_CTA_CLASS } from "@/components/home/FeaturedProductCard";
import MaxAudioPlayer from "@/components/max/MaxAudioPlayer";
import PlaylistCover from "@/components/playlists/PlaylistCover";
import { readMaxInitData } from "@/lib/max/bridge";
import {
  MAX_PLAYBACK_AUDIO_PATH,
  MAX_PLAYBACK_PREVIEW_PATH,
  MAX_PLAYBACK_SESSION_PATH,
  MAX_PLAYLISTS_DETAIL_PATH,
} from "@/lib/max/host";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";
import {
  advanceMaxPlaylistQueueOnEnded,
  firstMaxPlaylistQueueIndex,
  isMaxPlaylistItemPlayable,
  continueMaxPlaylistQueueAfterFailure,
  maxPlaylistPlaybackResource,
  maxPlaylistPlaybackSessionBody,
  narrowMaxPlaybackSession,
  nextMaxPlaylistQueueIndex,
  previousMaxPlaylistQueueIndex,
  toMaxPlaylistQueueItem,
  type MaxPlaylistQueueDirection,
  type MaxPlaylistQueueItem,
} from "@/lib/max/playlist-queue";
import {
  readMaxPlaylistDetailPayload,
  type MaxPlaylistDetail as MaxPlaylistDetailModel,
  type MaxPlaylistDetailItem,
} from "@/lib/max/playlist-types";
import {
  MAX_SHELL_LOGIN_CTA,
  MAX_SHELL_SIGNUP_CTA,
} from "@/lib/max/session-shell";
import { formatPlaylistItemCount } from "@/lib/playlists/format-item-count";

type DetailStatus =
  | { status: "loading" }
  | { status: "ready"; detail: MaxPlaylistDetailModel }
  | { status: "not_found" }
  | { status: "error" };

type BlockReason = "access_required" | "preview_unavailable" | "no_audio" | "not_found";

type PlaybackStatus =
  | { status: "idle" }
  | { status: "loading"; index: number }
  | {
      status: "ready";
      index: number;
      session: MaxPlaybackSession;
      playbackTicket: string;
    }
  | { status: "blocked"; index: number; reason: BlockReason }
  | { status: "error"; index: number };

function isBlockReason(value: unknown): value is BlockReason {
  return (
    value === "access_required" ||
    value === "preview_unavailable" ||
    value === "no_audio" ||
    value === "not_found"
  );
}

function itemMeta(item: MaxPlaylistDetailItem): string {
  return [item.formatLabel, item.durationLabel].filter(Boolean).join(" · ");
}

export default function MaxPlaylistDetail({
  slug,
  guestMode = false,
  onBack,
  onRequestLogin,
  onRequestSignup,
}: {
  slug: string;
  guestMode?: boolean;
  onBack: () => void;
  onRequestLogin?: () => void;
  onRequestSignup?: () => void;
}) {
  const [detailState, setDetailState] = useState<DetailStatus>({ status: "loading" });
  const [playback, setPlayback] = useState<PlaybackStatus>({ status: "idle" });
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [queueEnds, setQueueEnds] = useState<{ previous: number | null; next: number | null }>({
    previous: null,
    next: null,
  });
  const generationRef = useRef(0);
  const queueModeRef = useRef(false);
  const skippedRef = useRef<Set<number>>(new Set());
  const activeIndexRef = useRef<number | null>(null);
  const playRef = useRef<(() => void) | null>(null);
  const pauseRef = useRef<(() => void) | null>(null);
  const pendingPlayRef = useRef(false);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    const initData = readMaxInitData();
    if (!initData) {
      queueMicrotask(() => {
        if (generation === generationRef.current) {
          setDetailState({ status: "error" });
        }
      });
      return () => {
        generationRef.current += 1;
        controller.abort();
      };
    }

    void fetch(MAX_PLAYLISTS_DETAIL_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, slug }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => ({
        status: response.status,
        payload: await response.json().catch(() => null),
      }))
      .then(({ status, payload }) => {
        if (controller.signal.aborted || generation !== generationRef.current) {
          return;
        }
        if (status === 404) {
          setDetailState({ status: "not_found" });
          return;
        }
        const detail = readMaxPlaylistDetailPayload(payload);
        if (!detail) {
          setDetailState({ status: "error" });
          return;
        }
        setDetailState({ status: "ready", detail });
      })
      .catch(() => {
        if (!controller.signal.aborted && generation === generationRef.current) {
          setDetailState({ status: "error" });
        }
      });

    return () => {
      generationRef.current += 1;
      controller.abort();
    };
  }, [slug]);

  function bindPlay(play: () => void) {
    playRef.current = play;
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      play();
    }
  }

  function stopPlayback() {
    generationRef.current += 1;
    queueModeRef.current = false;
    pendingPlayRef.current = false;
    setPlaying(false);
    setActiveIndex(null);
    setQueueEnds({ previous: null, next: null });
    setPlayback({ status: "idle" });
  }

  function rememberQueueEnds(items: readonly MaxPlaylistQueueItem[], index: number) {
    setQueueEnds({
      previous: previousMaxPlaylistQueueIndex(items, index, skippedRef.current),
      next: nextMaxPlaylistQueueIndex(items, index, skippedRef.current),
    });
  }

  async function startAt(index: number, direction: MaxPlaylistQueueDirection | null) {
    if (detailState.status !== "ready") {
      return;
    }

    const detail = detailState.detail;
    const queue = detail.items.map(toMaxPlaylistQueueItem);
    const generation = ++generationRef.current;
    const item = queue[index];

    async function skipAndContinue(failureDirection: MaxPlaylistQueueDirection) {
      const nextIndex = continueMaxPlaylistQueueAfterFailure(
        queue,
        index,
        failureDirection,
        skippedRef.current,
      );
      if (nextIndex == null) {
        stopPlayback();
        return;
      }
      await startAt(nextIndex, failureDirection);
    }

    if (!item || !isMaxPlaylistItemPlayable(item)) {
      if (!direction) {
        setActiveIndex(index);
        setPlayback({ status: "blocked", index, reason: "not_found" });
        return;
      }

      await skipAndContinue(direction);
      return;
    }

    setActiveIndex(index);
    setPlayback({ status: "loading", index });
    const initData = readMaxInitData();
    if (!initData || !item.authorSlug || !item.productSlug) {
      setPlayback({ status: "error", index });
      return;
    }

    const playbackTarget = maxPlaylistPlaybackSessionBody(item);
    if (!playbackTarget) {
      setPlayback({ status: "error", index });
      return;
    }

    try {
      const response = await fetch(MAX_PLAYBACK_SESSION_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          ...playbackTarget,
        }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (generation !== generationRef.current) {
        return;
      }

      if (!response.ok || !payload?.session || typeof payload.playbackTicket !== "string") {
        const reason = isBlockReason(payload?.reason) ? payload.reason : "not_found";
        if (direction) {
          await skipAndContinue(direction);
          return;
        }
        setPlayback({ status: "blocked", index, reason });
        return;
      }

      const session = narrowMaxPlaybackSession(payload.session, item.audioItemId);
      if (!session) {
        if (direction) {
          await skipAndContinue(direction);
          return;
        }
        setPlayback({ status: "blocked", index, reason: "no_audio" });
        return;
      }

      pendingPlayRef.current = true;
      rememberQueueEnds(queue, index);
      setPlayback({
        status: "ready",
        index,
        session,
        playbackTicket: payload.playbackTicket,
      });
    } catch {
      if (generation === generationRef.current) {
        setPlayback({ status: "error", index });
      }
    }
  }

  function playAll() {
    if (detailState.status !== "ready") {
      return;
    }
    skippedRef.current = new Set();
    queueModeRef.current = true;
    const first = firstMaxPlaylistQueueIndex(detailState.detail.items.map(toMaxPlaylistQueueItem));
    if (first == null) {
      return;
    }
    void startAt(first, "next");
  }

  function playFrom(index: number) {
    if (detailState.status !== "ready") {
      return;
    }
    if (activeIndex === index && playback.status === "ready" && playback.index === index) {
      if (playing) {
        pauseRef.current?.();
      } else {
        playRef.current?.();
      }
      return;
    }
    skippedRef.current = new Set();
    queueModeRef.current = true;
    void startAt(index, null);
  }

  function handleEnded() {
    if (detailState.status !== "ready" || !queueModeRef.current) {
      stopPlayback();
      return;
    }
    const current = activeIndexRef.current;
    if (current == null) {
      stopPlayback();
      return;
    }
    const next = advanceMaxPlaylistQueueOnEnded({
      items: detailState.detail.items.map(toMaxPlaylistQueueItem),
      currentIndex: current,
      skipped: skippedRef.current,
    });
    if (next == null) {
      stopPlayback();
      return;
    }
    void startAt(next, "next");
  }

  const detail = detailState.status === "ready" ? detailState.detail : null;
  const queue = detail?.items.map(toMaxPlaylistQueueItem) ?? [];
  const canPlayAll = firstMaxPlaylistQueueIndex(queue) != null;
  const blocked =
    playback.status === "blocked" ? playback : null;

  return (
    <div data-max-playlist-detail={slug}>
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 text-sm font-medium text-[#7042c5]"
      >
        ← Плейлисты
      </button>

      {detailState.status === "loading" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Загружаем плейлист…</p>
      ) : null}
      {detailState.status === "not_found" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Плейлист недоступен.</p>
      ) : null}
      {detailState.status === "error" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить плейлист.</p>
      ) : null}

      {detail ? (
        <>
          <div className="mx-auto mt-4 w-full max-w-[280px]">
            <PlaylistCover
              title={detail.title}
              customCoverUrl={detail.coverUrl}
              mosaicCoverUrls={detail.mosaicCoverUrls}
              className="w-full rounded-[28px] shadow-[0_16px_40px_rgba(91,62,145,0.14)]"
              decorative={false}
            />
          </div>
          <h1 className="mt-5 text-[28px] font-semibold leading-8 text-[#25135c]">
            {detail.title}
          </h1>
          <p className="mt-2 text-sm text-[#7d70a2]">{detail.ownerLabel}</p>
          {detail.description ? (
            <p className="mt-3 text-sm leading-6 text-[#5c4f82]">{detail.description}</p>
          ) : null}
          <p className="mt-3 text-sm text-[#5c4f82]">
            {formatPlaylistItemCount(detail.itemsCount)}
            {detail.totalDurationLabel ? ` · ${detail.totalDurationLabel}` : ""}
          </p>
          {canPlayAll ? (
            <button
              type="button"
              onClick={playAll}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Слушать всё
            </button>
          ) : null}
          {detail.itemsCount === 0 ? (
            <p className="mt-6 text-sm leading-6 text-[#7d70a2]">
              В этом плейлисте пока нет доступных материалов.
            </p>
          ) : null}
          {detail.allUnavailable ? (
            <p className="mt-6 rounded-[18px] border border-[#f0d0d8] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]">
              Материалы этой подборки сейчас недоступны.
            </p>
          ) : null}

          {playback.status === "ready" ? (
            <MaxAudioPlayer
              key={`${playback.session.authorSlug}:${playback.session.productSlug}:${playback.session.tracks[0]?.trackId ?? ""}`}
              session={playback.session}
              externalQueue={{
                index: playback.index,
                length: detail.items.length,
                canGoPrevious: queueEnds.previous != null,
                canGoNext: queueEnds.next != null,
                onPrevious: () => {
                  if (queueEnds.previous == null) return;
                  void startAt(queueEnds.previous, "previous");
                },
                onNext: () => {
                  if (queueEnds.next == null) return;
                  void startAt(queueEnds.next, "next");
                },
              }}
              onBindPlay={bindPlay}
              onBindPause={(pause) => {
                pauseRef.current = pause;
              }}
              onPlayingChange={setPlaying}
              onPlaybackCompleted={handleEnded}
              fetchAudio={async (trackId, signal) => {
                const resource = maxPlaylistPlaybackResource(playback.session.playbackMode);
                const response = await fetch(
                  resource === "preview" ? MAX_PLAYBACK_PREVIEW_PATH : MAX_PLAYBACK_AUDIO_PATH,
                  {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      playbackTicket: playback.playbackTicket,
                      trackId,
                    }),
                    cache: "no-store",
                    signal,
                  },
                );
                if (resource === "preview") {
                  if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    return { ok: false, reason: payload?.reason ?? "error" };
                  }
                  const blob = await response.blob();
                  return { ok: true, url: URL.createObjectURL(blob), objectUrl: true };
                }
                const payload = await response.json().catch(() => null);
                if (response.ok && typeof payload?.url === "string") {
                  return { ok: true, url: payload.url };
                }
                return { ok: false, reason: payload?.reason ?? "error" };
              }}
            />
          ) : null}

          {blocked &&
          guestMode &&
          (blocked.reason === "access_required" || blocked.reason === "preview_unavailable") ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-sm text-[#6c5d94]">
                {blocked.reason === "preview_unavailable"
                  ? "Предпрослушивание пока недоступно."
                  : "Для прослушивания нужен доступ к продукту."}
              </p>
              <button type="button" onClick={onRequestLogin} className={FEATURED_CARD_PRIMARY_CTA_CLASS}>
                {MAX_SHELL_LOGIN_CTA}
              </button>
              <button
                type="button"
                onClick={onRequestSignup}
                className="w-full rounded-full border border-[#7042c5] px-5 py-4 text-[17px] font-medium text-[#7042c5]"
              >
                {MAX_SHELL_SIGNUP_CTA}
              </button>
            </div>
          ) : null}
          {playback.status === "error" ? (
            <p className="mt-4 text-sm text-[#6c5d94]">Не удалось подготовить прослушивание.</p>
          ) : null}

          <section className="mt-5 space-y-1.5" aria-label="Материалы плейлиста">
            {detail.items.map((item, index) => {
              const playable = isMaxPlaylistItemPlayable(toMaxPlaylistQueueItem(item));
              const current = activeIndex === index && playback.status !== "idle";
              const isPlayingThis = current && playing && playback.status === "ready";
              return (
                <article
                  key={item.key}
                  data-max-playlist-item={item.key}
                  className={`flex min-h-[76px] items-center gap-2 rounded-[16px] border px-2 py-1.5 ${
                    current
                      ? "border-[#7042c5] bg-[#f6f1fd]"
                      : "border-[#eadff8] bg-white"
                  }`}
                >
                  <button
                    type="button"
                    disabled={!playable}
                    aria-label={
                      playable
                        ? isPlayingThis
                          ? `Пауза ${item.title}`
                          : `Слушать ${item.title}`
                        : `${item.title} — недоступно`
                    }
                    onClick={() => playFrom(index)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-white disabled:opacity-40"
                  >
                    {isPlayingThis ? (
                      <span aria-hidden="true" className="text-xs font-semibold">
                        II
                      </span>
                    ) : (
                      <span aria-hidden="true" className="ml-0.5 text-xs">
                        ▶
                      </span>
                    )}
                  </button>
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-[#f4ecfb]">
                    {item.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- item cover is already a display URL
                      <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-[#25135c]">{item.title}</p>
                    <p className="line-clamp-1 text-xs text-[#7d70a2]">
                      {item.authorName || "\u00a0"}
                    </p>
                    <p className="line-clamp-1 text-xs text-[#7d70a2]">
                      {playable ? itemMeta(item) || "\u00a0" : "Недоступно"}
                    </p>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}
