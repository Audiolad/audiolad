"use client";

import { useEffect, useRef, useState } from "react";

import { labErrorMessage } from "@/components/music-lab/api";

type LabPlayerProps = {
  publicCode: string;
  label: string;
};

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function LabPlayer({ publicCode, label }: LabPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackCode, setTrackCode] = useState(publicCode);

  if (trackCode !== publicCode) {
    setTrackCode(publicCode);
    setSrc(null);
    setMessage(null);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
  }

  useEffect(() => {
    const audio = audioRef.current;
    let cancelled = false;

    async function load() {
      const response = await fetch(
        `/api/music-analyzer/audio/listening-v05/${encodeURIComponent(publicCode)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (cancelled) {
        return;
      }
      if (!response.ok || !payload.url) {
        setMessage(labErrorMessage(payload.error ?? "audio_missing"));
        return;
      }
      setSrc(payload.url);
    }

    void load();
    return () => {
      cancelled = true;
      audio?.pause();
    };
  }, [publicCode]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || !src) {
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setMessage("Не удалось начать воспроизведение.");
      }
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  return (
    <div className="rounded-[28px] border border-[#e4d7f4] bg-white p-5">
      <p className="text-sm font-medium text-[#796ba0]">{label}</p>
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!src}
          aria-label={playing ? "Пауза" : "Слушать"}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-lg font-semibold text-white disabled:bg-[#d9cceb]"
        >
          {playing ? "II" : "▶"}
        </button>
        <div className="min-w-0 flex-1">
          <input
            aria-label="Позиция"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            disabled={!src || duration === 0}
            onChange={(event) => {
              const next = Number(event.target.value);
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = next;
              }
              setCurrent(next);
            }}
            className="w-full accent-[#7042c5]"
          />
          <p className="mt-2 text-sm tabular-nums text-[#25135c]">
            {formatClock(current)} / {formatClock(duration)}
          </p>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-[#8a6070]">{message}</p> : null}
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onError={() => setMessage(labErrorMessage("audio_missing"))}
      />
    </div>
  );
}
