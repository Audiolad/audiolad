"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import MaxAudioPlayer from "@/components/max/MaxAudioPlayer";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { PlayIcon } from "@/components/home/HomeIcons";
import {
  FEATURED_CARD_CHIP_CLASS,
  FEATURED_CARD_META_CLASS,
  FEATURED_CARD_PRIMARY_CTA_CLASS,
  FEATURED_CARD_SUBTITLE_CLASS,
  FEATURED_CARD_TITLE_CLASS,
} from "@/components/home/FeaturedProductCard";
import { formatMaxDuration } from "@/lib/max/format-duration";
import { decideMaxProductTrackAction } from "@/lib/max/max-audio-playback";
import type { MaxPlaybackSession } from "@/lib/max/playback-types";
import { initVkBridge } from "@/lib/vk/bridge";
import { readVkLaunchTarget, vkLaunchTargetToken } from "@/lib/vk/launch-target";
import { readVkProductView, type VkProductView } from "@/lib/vk/product-view";
import { PLAY_ACTION_LABEL, PREVIEW_ACTION_LABEL } from "@/lib/ui/action-labels";

type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "missing_target" }
  | { status: "not_found" }
  | { status: "error" }
  | { status: "ready"; product: VkProductView; target: string };

type PlaybackState =
  | { status: "idle" | "loading" | "access_required" | "preview_unavailable" | "no_audio" | "error" }
  | { status: "ready"; session: MaxPlaybackSession };

function readPlaybackSession(value: unknown): MaxPlaybackSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    "practiceId" in row ||
    "audio_path" in row ||
    "storage_path" in row ||
    typeof row.title !== "string" ||
    typeof row.authorSlug !== "string" ||
    typeof row.productSlug !== "string" ||
    (row.playbackMode !== "full" && row.playbackMode !== "preview") ||
    !Array.isArray(row.tracks)
  ) {
    return null;
  }

  const tracks = row.tracks.flatMap((track) => {
    if (!track || typeof track !== "object" || Array.isArray(track)) return [];
    const item = track as Record<string, unknown>;
    if ("audio_path" in item || "storage_path" in item || "practiceId" in item) return [];
    if (typeof item.trackId !== "string" || typeof item.title !== "string") return [];
    if (typeof item.position !== "number") return [];
    if (item.durationSeconds !== null && typeof item.durationSeconds !== "number") return [];
    return [{
      trackId: item.trackId,
      title: item.title,
      position: item.position,
      durationSeconds: item.durationSeconds === null ? null : item.durationSeconds,
      coverUrl: typeof item.coverUrl === "string" || item.coverUrl === null ? item.coverUrl : null,
    }];
  });
  if (tracks.length !== row.tracks.length || tracks.length === 0) return null;

  return {
    authorSlug: row.authorSlug,
    productSlug: row.productSlug,
    title: row.title,
    authorName: typeof row.authorName === "string" || row.authorName === null ? row.authorName : null,
    formatLabel: typeof row.formatLabel === "string" || row.formatLabel === null ? row.formatLabel : null,
    coverUrl: typeof row.coverUrl === "string" || row.coverUrl === null ? row.coverUrl : null,
    playbackMode: row.playbackMode,
    tracks,
  };
}

export default function VkMiniAppScreen() {
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [playback, setPlayback] = useState<PlaybackState>({ status: "idle" });
  const [listenArmed, setListenArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const playRef = useRef<(() => void) | null>(null);
  const pauseRef = useRef<(() => void) | null>(null);
  const selectTrackRef = useRef<((index: number) => void) | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingTrackIndexRef = useRef<number | null>(null);
  const targetRef = useRef("");

  useEffect(() => {
    void initVkBridge();
  }, []);

  const fetchAudio = useCallback(async (trackId: string, signal: AbortSignal) => {
    const response = await fetch("/api/vk/playback/audio", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: targetRef.current, trackId }),
      cache: "no-store",
      signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.ok && contentType.includes("audio/")) {
      const blob = await response.blob();
      return { ok: true as const, url: URL.createObjectURL(blob), objectUrl: true as const };
    }
    const payload = await response.json().catch(() => null);
    if (response.ok && typeof payload?.url === "string") {
      return { ok: true as const, url: payload.url };
    }
    return {
      ok: false as const,
      reason: typeof payload?.reason === "string" ? payload.reason : "error",
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let generation = 0;

    async function loadFromLocation() {
      setListenArmed(false);
      setPlaying(false);
      setActiveTrackId(null);
      playRef.current = null;
      pauseRef.current = null;
      selectTrackRef.current = null;
      pendingPlayRef.current = false;
      pendingTrackIndexRef.current = null;
      const requestGeneration = ++generation;

      const launch = readVkLaunchTarget({
        hash: window.location.hash,
        search: window.location.search,
      });
      if (!launch) {
        targetRef.current = "";
        setDetail({ status: "missing_target" });
        setPlayback({ status: "idle" });
        return;
      }

      const target = vkLaunchTargetToken(launch);
      setDetail({ status: "loading" });
      setPlayback({ status: "loading" });

      try {
        const response = await fetch("/api/vk/product", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted || requestGeneration !== generation) return;
        if (response.status === 404) {
          setDetail({ status: "not_found" });
          setPlayback({ status: "idle" });
          return;
        }
        const product = readVkProductView(payload?.product);
        if (!response.ok || !product) {
          setDetail({ status: "error" });
          setPlayback({ status: "idle" });
          return;
        }
        targetRef.current = target;
        setDetail({ status: "ready", product, target });
      } catch {
        if (!controller.signal.aborted) {
          setDetail({ status: "error" });
          setPlayback({ status: "idle" });
        }
      }
    }

    void loadFromLocation();
    window.addEventListener("hashchange", loadFromLocation);
    return () => {
      controller.abort();
      window.removeEventListener("hashchange", loadFromLocation);
    };
  }, []);

  useEffect(() => {
    if (detail.status !== "ready") return;
    const controller = new AbortController();
    const target = detail.target;
    void fetch("/api/vk/playback/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => ({
        status: response.status,
        payload: await response.json().catch(() => null),
      }))
      .then(({ status, payload }) => {
        if (controller.signal.aborted) return;
        if (status === 403 && payload?.reason === "preview_unavailable") {
          setPlayback({ status: "preview_unavailable" });
          return;
        }
        if (status === 403) {
          setPlayback({ status: "access_required" });
          return;
        }
        if (status === 404 && payload?.reason === "no_audio") {
          setPlayback({ status: "no_audio" });
          return;
        }
        const session = readPlaybackSession(payload?.session);
        if (!session || "practiceId" in (payload?.session ?? {})) {
          setPlayback({ status: "error" });
          return;
        }
        setPlayback({ status: "ready", session });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPlayback({ status: "error" });
      });
    return () => controller.abort();
  }, [detail]);

  const bindPlay = useCallback((play: () => void) => {
    playRef.current = play;
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      play();
    }
  }, []);

  const bindSelectTrack = useCallback((selectTrack: (index: number) => void) => {
    selectTrackRef.current = selectTrack;
    if (pendingTrackIndexRef.current == null) return;
    const index = pendingTrackIndexRef.current;
    pendingTrackIndexRef.current = null;
    selectTrack(index);
  }, []);

  function startListening() {
    if (playback.status !== "ready") return;
    const firstId = playback.session.tracks[0]?.trackId ?? null;
    if (firstId) setActiveTrackId(firstId);
    setListenArmed(true);
    if (playRef.current) playRef.current();
    else pendingPlayRef.current = true;
  }

  function pressTrack(audioItemId: string) {
    if (playback.status !== "ready") return;
    const decision = decideMaxProductTrackAction({
      tracks: playback.session.tracks,
      audioItemId,
      activeTrackId,
      listenArmed,
      isPlaying: playing,
    });
    if (decision.type === "ignore") return;
    if (decision.type === "pause") {
      pauseRef.current?.();
      return;
    }
    if (decision.type === "resume") {
      setListenArmed(true);
      if (playRef.current) playRef.current();
      else pendingPlayRef.current = true;
      return;
    }
    const track = playback.session.tracks[decision.index];
    if (!track) return;
    pendingPlayRef.current = false;
    setActiveTrackId(track.trackId);
    setListenArmed(true);
    if (selectTrackRef.current) selectTrackRef.current(decision.index);
    else pendingTrackIndexRef.current = decision.index;
  }

  const product = detail.status === "ready" ? detail.product : null;
  const playableTrackIds = new Set(
    playback.status === "ready" ? playback.session.tracks.map((track) => track.trackId) : [],
  );
  const playLabel =
    playback.status === "ready" && playback.session.playbackMode === "preview"
      ? PREVIEW_ACTION_LABEL
      : PLAY_ACTION_LABEL;

  return (
    <main className="min-h-dvh bg-[#faf8ff] px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] text-[#25135c]">
      <div className="mx-auto w-full max-w-lg">
        <AudioladHorizontalLogo
          className="h-8 w-auto max-w-full object-contain object-left"
          linkClassName="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          href={null}
          priority
          sizes="160px"
        />

        {detail.status === "loading" ? (
          <p className="mt-8 text-sm text-[#6c5d94]">Загрузка релиза…</p>
        ) : null}
        {detail.status === "missing_target" ? (
          <section className="mt-8">
            <h1 className="text-[28px] font-semibold leading-tight">АудиоЛад</h1>
            <p className="mt-3 text-sm leading-6 text-[#4a3d73]">
              Откройте ссылку на релиз, чтобы начать прослушивание.
            </p>
          </section>
        ) : null}
        {detail.status === "not_found" ? (
          <p className="mt-8 text-sm text-[#6c5d94]">Этот релиз недоступен.</p>
        ) : null}
        {detail.status === "error" ? (
          <p className="mt-8 text-sm text-[#6c5d94]">Не удалось загрузить релиз.</p>
        ) : null}

        {product ? (
          <article className="mt-6" data-vk-product="">
            <ProductCoverThumbnail
              slug={product.productSlug}
              title={product.title}
              coverUrl={product.coverUrl}
              authorName={product.metaLine}
              className="aspect-square w-full rounded-[28px]"
              displayWidth={640}
              priority
            />
            {product.formatLabel ? (
              <p className={`${FEATURED_CARD_CHIP_CLASS} mt-4`}>{product.formatLabel}</p>
            ) : null}
            <h1 className={FEATURED_CARD_TITLE_CLASS}>{product.title}</h1>
            {product.subtitle ? (
              <p className={FEATURED_CARD_SUBTITLE_CLASS}>{product.subtitle}</p>
            ) : null}
            {product.metaLine ? (
              <p className={FEATURED_CARD_META_CLASS} data-vk-product-meta="">
                {product.metaLine}
              </p>
            ) : null}

            {playback.status === "loading" ? (
              <p className="mt-4 text-sm text-[#6c5d94]">Проверяем доступ к прослушиванию…</p>
            ) : null}
            {playback.status === "access_required" || playback.status === "preview_unavailable" ? (
              <p className="mt-4 text-sm text-[#6c5d94]">Для прослушивания нужен доступ к продукту.</p>
            ) : null}
            {playback.status === "no_audio" ? (
              <p className="mt-4 text-sm text-[#6c5d94]">В этом релизе пока нет аудио.</p>
            ) : null}
            {playback.status === "error" ? (
              <p className="mt-4 text-sm text-[#6c5d94]">Не удалось подготовить прослушивание.</p>
            ) : null}

            {playback.status === "ready" ? (
              <div
                className={listenArmed ? undefined : "pointer-events-none absolute h-px w-px overflow-hidden"}
                inert={listenArmed ? undefined : true}
              >
                <MaxAudioPlayer
                  session={playback.session}
                  hideTrackList
                  onBindPlay={bindPlay}
                  onBindPause={(pause) => {
                    pauseRef.current = pause;
                  }}
                  onBindSelectTrack={bindSelectTrack}
                  onPlayingChange={setPlaying}
                  onActiveTrackChange={(track) => setActiveTrackId(track.trackId)}
                  fetchAudio={fetchAudio}
                />
              </div>
            ) : null}

            {!listenArmed && playback.status === "ready" ? (
              <button type="button" onClick={startListening} className={`${FEATURED_CARD_PRIMARY_CTA_CLASS} mt-4`}>
                <PlayIcon />
                {playLabel}
              </button>
            ) : null}

            {product.contents.length ? (
              <ol className="mt-6 space-y-1.5" data-vk-product-contents="" aria-label="Треки">
                {product.contents.map((track) => {
                  const playable = playableTrackIds.has(track.audioItemId);
                  const active = activeTrackId === track.audioItemId;
                  const playingThis = active && playing && listenArmed;
                  return (
                    <li
                      key={track.audioItemId}
                      className={`flex min-h-11 items-center gap-2 rounded-xl px-1 py-1 ${active && listenArmed ? "bg-[#f3edfb]" : ""}`}
                    >
                      {playable ? (
                        <button
                          type="button"
                          aria-label={playingThis ? `Пауза ${track.title}` : `Слушать ${track.title}`}
                          onClick={() => pressTrack(track.audioItemId)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-xs text-white"
                        >
                          <span aria-hidden="true">{playingThis ? "II" : "▶"}</span>
                        </button>
                      ) : (
                        <span className="h-9 w-9 shrink-0" aria-hidden="true" />
                      )}
                      <span className="w-6 shrink-0 text-center text-xs text-[#6c5d94]">{track.position}</span>
                      <span className={`min-w-0 flex-1 truncate text-sm ${active && listenArmed ? "font-medium text-[#7042c5]" : "text-[#25135c]"}`}>
                        {track.title}
                      </span>
                      {track.durationSeconds !== null ? (
                        <span className="shrink-0 text-xs text-[#6c5d94]">
                          {formatMaxDuration(track.durationSeconds)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </article>
        ) : null}
      </div>
    </main>
  );
}
