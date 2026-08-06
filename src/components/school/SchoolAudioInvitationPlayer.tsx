"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

import { useGlobalAudioPlayer } from "@/components/audio/GlobalAudioPlayerProvider";
import { STOP_LOCAL_AUDIO_EVENT } from "@/lib/audio/local-audio-coordination";
import { fetchListenSessionPayload } from "@/lib/playlists/fetch-listen-session";
import { formatAudioDuration } from "@/lib/products/duration";
import {
  SCHOOL_INVITATION_AUTHOR_SLUG,
  SCHOOL_INVITATION_LISTEN_API_BASE,
  SCHOOL_INVITATION_PRODUCT_SLUG,
} from "@/lib/school/audio-invitation";
import {
  requestStopSchoolVideos,
  SCHOOL_STOP_AUDIO_EVENT,
} from "@/lib/school/school-media-coordination";

type MetaState = {
  trackId: string;
  durationSeconds: number;
  coverImageUrl: string | null;
};

function formatClock(seconds: number): string {
  return formatAudioDuration(seconds) ?? "00:00";
}

function toSameOriginAssetUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, "https://audiolad.ru");
    if (parsed.pathname.startsWith("/storage/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return url;
  } catch {
    return url;
  }
}

export default function SchoolAudioInvitationPlayer({
  onMeta,
}: {
  onMeta?: (meta: {
    durationSeconds: number;
    coverImageUrl: string | null;
  }) => void;
}) {
  const { stopAndClear } = useGlobalAudioPlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metaRef = useRef<MetaState | null>(null);
  const signedUrlRef = useRef<string | null>(null);
  const urlLockRef = useRef(false);
  const onMetaRef = useRef(onMeta);
  const [, startTransition] = useTransition();

  const [meta, setMeta] = useState<MetaState | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const durationSeconds = meta?.durationSeconds ?? 0;

  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);

  const pauseLocal = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    setIsPlaying(false);
  }, []);

  const loadMeta = useCallback(async (): Promise<MetaState | null> => {
    if (metaRef.current) {
      return metaRef.current;
    }

    const sessionResult = await fetchListenSessionPayload(
      SCHOOL_INVITATION_AUTHOR_SLUG,
      SCHOOL_INVITATION_PRODUCT_SLUG,
    );

    if (!sessionResult.ok) {
      return null;
    }

    const track = [...sessionResult.session.tracks].sort(
      (left, right) => left.position - right.position,
    )[0];

    if (!track?.id) {
      return null;
    }

    const nextMeta: MetaState = {
      trackId: track.id,
      durationSeconds: track.durationSeconds ?? 0,
      coverImageUrl: toSameOriginAssetUrl(sessionResult.session.coverImageUrl),
    };

    metaRef.current = nextMeta;
    return nextMeta;
  }, []);

  const ensureSignedUrl = useCallback(async (): Promise<MetaState | null> => {
    const readyMeta = await loadMeta();
    if (!readyMeta) {
      setErrorMessage("Аудиопока недоступно. Попробуйте позже.");
      return null;
    }

    if (signedUrlRef.current) {
      return readyMeta;
    }

    if (urlLockRef.current) {
      return readyMeta;
    }

    urlLockRef.current = true;
    setIsLoading(true);

    try {
      const audioResponse = await fetch(
        `${SCHOOL_INVITATION_LISTEN_API_BASE}/audio/${encodeURIComponent(readyMeta.trackId)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = (await audioResponse.json().catch(() => null)) as {
        url?: string;
      } | null;

      if (!audioResponse.ok || !payload?.url) {
        setErrorMessage("Не удалось подготовить аудио. Попробуйте ещё раз.");
        return null;
      }

      signedUrlRef.current = payload.url;
      return readyMeta;
    } catch {
      setErrorMessage("Не удалось загрузить аудио. Попробуйте ещё раз.");
      return null;
    } finally {
      urlLockRef.current = false;
      setIsLoading(false);
    }
  }, [loadMeta]);

  const play = useCallback(async () => {
    setErrorMessage(null);
    requestStopSchoolVideos();
    stopAndClear();

    const readyMeta = await ensureSignedUrl();
    const audio = audioRef.current;
    const url = signedUrlRef.current;

    if (!readyMeta || !audio || !url) {
      return;
    }

    if (audio.getAttribute("src") !== url) {
      audio.src = url;
      audio.load();
    }

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setErrorMessage("Нажмите ещё раз, чтобы начать прослушивание.");
    }
  }, [ensureSignedUrl, stopAndClear]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pauseLocal();
      return;
    }
    void play();
  }, [isPlaying, pauseLocal, play]);

  const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const next = Number(event.target.value);
    if (!audio || !Number.isFinite(next)) {
      return;
    }
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadMeta().then((nextMeta) => {
      if (cancelled || !nextMeta) {
        return;
      }

      startTransition(() => {
        setMeta(nextMeta);
        onMetaRef.current?.({
          durationSeconds: nextMeta.durationSeconds,
          coverImageUrl: nextMeta.coverImageUrl,
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [loadMeta]);

  useEffect(() => {
    const onStop = () => {
      pauseLocal();
    };

    window.addEventListener(STOP_LOCAL_AUDIO_EVENT, onStop);
    window.addEventListener(SCHOOL_STOP_AUDIO_EVENT, onStop);
    return () => {
      window.removeEventListener(STOP_LOCAL_AUDIO_EVENT, onStop);
      window.removeEventListener(SCHOOL_STOP_AUDIO_EVENT, onStop);
    };
  }, [pauseLocal]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        pauseLocal();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pauseLocal]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (!audio) {
        return;
      }
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, []);

  const progressMax = durationSeconds > 0 ? durationSeconds : 1;
  const progressValue = Math.min(currentTime, progressMax);

  return (
    <div className="school-invite__player">
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          setIsPlaying(false);
          setErrorMessage("Ошибка воспроизведения. Попробуйте ещё раз.");
        }}
      />

      <div className="school-invite__controls">
        <button
          type="button"
          className="school-invite__play"
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          disabled={isLoading}
          onClick={toggle}
        >
          <span className="school-invite__play-icon" aria-hidden="true">
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6.5" y="5.5" width="3.8" height="13" rx="1" />
                <rect x="13.7" y="5.5" width="3.8" height="13" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.2 5.8a1.2 1.2 0 0 0-1.85 1.01v10.38A1.2 1.2 0 0 0 8.2 18.2l9.1-5.19a1.2 1.2 0 0 0 0-2.08L8.2 5.8Z" />
              </svg>
            )}
          </span>
          <span className="school-invite__play-label">
            {isLoading ? "Загрузка…" : isPlaying ? "Пауза" : "Слушать"}
          </span>
        </button>

        <div className="school-invite__timeline">
          <input
            className="school-invite__seek"
            type="range"
            min={0}
            max={progressMax}
            step={0.1}
            value={progressValue}
            aria-label="Положение воспроизведения"
            disabled={!meta || isLoading}
            onChange={handleSeek}
          />
          <div className="school-invite__times">
            <span className="school-number">{formatClock(currentTime)}</span>
            <span className="school-number">
              {formatClock(durationSeconds)}
            </span>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <p className="school-invite__error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
