"use client";

import { useEffect, useRef, useState } from "react";

import { formatPlaybackClock } from "@/lib/business-app/playback-clock";

type Preview = { title: string; authorName: string; url: string };

/**
 * Plays one real catalog track for the chosen atmosphere.
 * The venue player starts only after the point exists, so this preview does not heartbeat.
 */
export default function OnboardingPreviewPlayer({ atmosphereId }: { atmosphereId: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestKey = atmosphereId ? `${atmosphereId}:${attempt}` : "";
  const [loaded, setLoaded] = useState<{ key: string; preview: Preview | null; failed: boolean } | null>(null);
  const preview = loaded?.key === requestKey ? loaded.preview : null;
  const phase: "loading" | "ready" | "error" = !atmosphereId
    ? "loading"
    : !loaded || loaded.key !== requestKey
      ? "loading"
      : loaded.failed || !preview
        ? "error"
        : "ready";
  const [playingKey, setPlayingKey] = useState("");
  const playing = playingKey === requestKey && phase === "ready";
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!atmosphereId) return;
    const audio = audioRef.current;
    let cancelled = false;
    const key = `${atmosphereId}:${attempt}`;
    audio?.pause();
    void fetch("/api/business/onboarding/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ atmosphereId }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: Preview } | null;
        if (cancelled) return;
        if (!json?.ok || !json.data?.url) {
          setLoaded({ key, preview: null, failed: true });
          return;
        }
        setLoaded({ key, preview: json.data, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, preview: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [atmosphereId, attempt]);

  const listen = () => {
    const audio = audioRef.current;
    if (!audio || !preview) return;
    if (!audio.paused) {
      audio.pause();
      setPlayingKey("");
      return;
    }
    if (audio.dataset.previewUrl !== preview.url) {
      audio.src = preview.url;
      audio.dataset.previewUrl = preview.url;
    }
    void audio.play().then(() => setPlayingKey(requestKey)).catch(() => {
      setLoaded({ key: requestKey, preview: null, failed: true });
    });
  };

  return (
    <div className="space-y-3" data-testid="onboarding-preview-player">
      <p className="text-[var(--biz-text)]">Послушайте, как звучит выбранная атмосфера.</p>
      {phase === "loading" ? <p className="text-sm text-[var(--biz-text-muted)]">Открываем фрагмент…</p> : null}
      {phase === "ready" && preview ? (
        <div className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface)] px-4 py-3">
          <p className="font-semibold text-[var(--biz-text)]">
            {preview.title}{preview.authorName ? ` – ${preview.authorName}` : ""}
          </p>
          <p className="mt-1 text-sm text-[var(--biz-text-muted)]" data-testid="onboarding-preview-time">
            {formatPlaybackClock(now)} / {formatPlaybackClock(duration)}
          </p>
          <button
            type="button"
            className="business-app-btn business-app-btn-primary business-app-focus-ring mt-3"
            onClick={listen}
          >
            {playing ? "Пауза" : "Слушать"}
          </button>
        </div>
      ) : null}
      {phase === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--biz-text)]">
            Фрагмент не открылся. Нажмите «Повторить» или «Далее», чтобы продолжить.
          </p>
          <button
            type="button"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Повторить
          </button>
        </div>
      ) : null}
      <audio
        ref={audioRef}
        preload="none"
        playsInline
        onTimeUpdate={(event) => setNow(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onPause={() => setPlayingKey("")}
        onPlay={() => setPlayingKey(requestKey)}
      />
    </div>
  );
}
