"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PracticeEmbedMode } from "@/lib/embed/practice-embed";
import {
  LISTEN_STATS_HEARTBEAT_MS,
  reportListenStatsHeartbeat,
} from "@/lib/listen/listen-stats-client";

type Props = {
  mode: PracticeEmbedMode;
  title: string;
  typeLabel: string | null;
  subtitle: string | null;
  metaLine: string | null;
  coverUrl: string | null;
  coverAlt: string;
  practiceUrl: string;
  apiBase: string;
  practiceId: string;
  audioItemId: string | null;
};

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
    <path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2c.6-.4.6-1.3 0-1.7L9.6 4.9C8.9 4.5 8 5 8 5.8Z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
);

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-70";

export default function PracticeEmbedCard(props: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastReportedRef = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  const canPlayInline = props.mode === "play" && props.audioItemId !== null && !failed;

  const report = useCallback(
    (phase: "advance" | "seek" | "pause" | "ended", keepalive = false) => {
      const audio = audioRef.current;
      if (!audio || !props.audioItemId) return;
      const positionMs = Math.floor(audio.currentTime * 1000);
      reportListenStatsHeartbeat({
        apiBase: props.apiBase,
        audioItemId: props.audioItemId,
        positionMs,
        priorPositionMs: lastReportedRef.current,
        playbackRate: audio.playbackRate,
        practiceId: props.practiceId,
        phase,
        isPlaying: phase === "advance",
        keepalive,
      });
      lastReportedRef.current = positionMs;
    },
    [props.apiBase, props.audioItemId, props.practiceId],
  );

  useEffect(() => {
    if (state !== "playing") return;
    const timer = window.setInterval(() => report("advance"), LISTEN_STATS_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [state, report]);

  const loadSignedUrl = useCallback(async (): Promise<string | null> => {
    if (!props.audioItemId) return null;
    const response = await fetch(
      `${props.apiBase}/audio/${encodeURIComponent(props.audioItemId)}`,
      { credentials: "same-origin", cache: "no-store" },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { url?: unknown };
    return typeof body.url === "string" ? body.url : null;
  }, [props.apiBase, props.audioItemId]);

  const onPrimary = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === "playing") {
      audio.pause();
      return;
    }
    if (!audio.src) {
      setState("loading");
      const url = await loadSignedUrl().catch(() => null);
      if (!url) {
        setFailed(true);
        setState("idle");
        window.open(props.practiceUrl, "_blank", "noopener");
        return;
      }
      audio.src = url;
    }
    try {
      await audio.play();
    } catch {
      setState("paused");
    }
  }, [state, loadSignedUrl, props.practiceUrl]);

  const onAudioError = useCallback(async () => {
    // Signed URL may have expired: re-sign once and resume from the same spot.
    const audio = audioRef.current;
    if (!audio) return;
    const at = audio.currentTime;
    const url = await loadSignedUrl().catch(() => null);
    if (!url) {
      setFailed(true);
      setState("idle");
      return;
    }
    audio.src = url;
    audio.currentTime = at;
    void audio.play().catch(() => setState("paused"));
  }, [loadSignedUrl]);

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <main className="flex min-h-dvh items-start justify-center bg-transparent p-0">
      <article
        data-practice-embed="true"
        data-practice-embed-mode={props.mode}
        className="w-full max-w-[420px] overflow-hidden rounded-[28px] bg-white shadow-[0_10px_30px_rgba(36,19,63,0.12)]"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-[#efe7fb]">
          {props.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.coverUrl}
              alt={props.coverAlt}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
          ) : null}
        </div>
        <div className="px-5 pb-5 pt-5">
          {props.typeLabel ? (
            <span className="inline-flex w-fit rounded-full bg-[#f4ecfb] px-3 py-1 text-xs font-medium text-[#7042c5]">
              {props.typeLabel}
            </span>
          ) : null}
          <h2 className="mt-3 text-[22px] font-semibold leading-tight text-[#25135c]">
            {props.title}
          </h2>
          {props.subtitle ? (
            <p className="mt-2 text-sm font-medium text-[#7042c5]">{props.subtitle}</p>
          ) : null}
          {props.metaLine ? (
            <p className="mt-2 text-sm text-[#7d70a2]">{props.metaLine}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {canPlayInline ? (
              <button
                type="button"
                data-practice-embed-play="true"
                aria-pressed={state === "playing"}
                aria-busy={state === "loading"}
                disabled={state === "loading"}
                onClick={() => void onPrimary()}
                className={BUTTON_CLASS}
              >
                {state === "playing" ? <PauseIcon /> : <PlayIcon />}
                {state === "playing" ? "Пауза" : state === "paused" ? "Продолжить" : "Слушать"}
              </button>
            ) : (
              <a
                href={props.practiceUrl}
                target="_blank"
                rel="noopener"
                data-practice-embed-link="true"
                className={BUTTON_CLASS}
              >
                <PlayIcon />
                Слушать
              </a>
            )}
          </div>
          {canPlayInline && state !== "idle" ? (
            <div className="mt-4" data-practice-embed-progress="true">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={1}
                value={position}
                aria-label="Перемотка"
                onChange={(event) => {
                  const audio = audioRef.current;
                  if (audio) audio.currentTime = Number(event.target.value);
                }}
                className="w-full accent-[#7042c5]"
                style={{ backgroundSize: `${progress}% 100%` }}
              />
              <div className="mt-1 flex justify-between text-xs text-[#7d70a2]">
                <span>{formatClock(position)}</span>
                <span>{formatClock(duration)}</span>
              </div>
            </div>
          ) : null}
          <p className="mt-4 text-xs text-[#9a8fb8]">
            <a href={props.practiceUrl} target="_blank" rel="noopener" className="text-inherit underline-offset-2 hover:underline">
              Аудиолад
            </a>
          </p>
        </div>
        {canPlayInline ? (
          <audio
            ref={audioRef}
            preload="none"
            onPlay={() => {
              setState("playing");
              report("advance");
            }}
            onPause={() => {
              if (audioRef.current?.ended) return;
              setState("paused");
              report("pause", true);
            }}
            onEnded={() => {
              setState("paused");
              report("ended", true);
            }}
            onSeeked={() => report("seek")}
            onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onError={() => void onAudioError()}
          />
        ) : null}
      </article>
    </main>
  );
}
