"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AudiobookFragment } from "@/lib/audiobooks/server";
import {
  activeAudiobookFragmentQueue,
  audiobookFragmentEndedTransition,
  reconcileAudiobookFragmentQueue,
} from "./audiobook-chapter-player-queue";

type Props = {
  authorId: string;
  projectId: string;
  chapterId: string;
  fragments: AudiobookFragment[];
};

const PLAYBACK_ERROR = "Не удалось воспроизвести аудио. Попробуйте ещё раз.";
const RESUME_ERROR = "Не удалось возобновить аудио. Нажмите «Повторить».";

function pausedPlaybackTime(audio: HTMLAudioElement) {
  const currentTime = Number.isFinite(audio.currentTime) && audio.currentTime > 0
    ? audio.currentTime
    : 0;

  if (!Number.isFinite(audio.duration)) return currentTime;

  // Seeking exactly to duration can emit `ended` and advance the queue.
  const lastPlayableTime = audio.duration > 0 ? audio.duration - 0.01 : 0;
  return Math.min(currentTime, lastPlayableTime);
}

function waitForAudioReadiness(audio: HTMLAudioElement) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("error", handleError);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("playback_url_load_failed"));
    };

    audio.addEventListener("loadedmetadata", handleReady, { once: true });
    audio.addEventListener("error", handleError, { once: true });
  });
}

export function AudiobookChapterPlayer({ authorId, projectId, chapterId, fragments }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestRef = useRef(0);
  const retryRef = useRef(0);
  const recoveryRef = useRef<number | null>(null);
  const playAtRef = useRef<(index: number, retry?: boolean) => void>(() => {});
  const currentIndexRef = useRef(0);
  const queue = useMemo(() => activeAudiobookFragmentQueue(fragments), [fragments]);
  const previousQueueRef = useRef(queue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const reset = useCallback(() => {
    requestRef.current += 1;
    retryRef.current = 0;
    recoveryRef.current = null;
    currentIndexRef.current = 0;
    const audio = audioRef.current;
    audio?.pause();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    setCurrentIndex(0);
    setIsPlaying(false);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => reset, [chapterId, reset]);

  useEffect(() => {
    const transition = reconcileAudiobookFragmentQueue(
      previousQueueRef.current,
      currentIndexRef.current,
      queue,
    );
    previousQueueRef.current = queue;
    if (transition.shouldReset) {
      reset();
      return;
    }
    if (transition.currentIndex !== currentIndexRef.current) {
      currentIndexRef.current = transition.currentIndex;
      setCurrentIndex(transition.currentIndex);
    }
  }, [queue, reset]);

  const recoverPausedPlayback = useCallback(async (
    index: number,
    requestId: number,
    pausedAt: number,
  ) => {
    const fragment = queue[index];
    const audio = audioRef.current;
    if (!fragment || !audio || requestId !== requestRef.current || recoveryRef.current !== null) return;

    recoveryRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio/audiobooks/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/fragments/${encodeURIComponent(fragment.id)}/playback?authorId=${encodeURIComponent(authorId)}`,
        { credentials: "same-origin" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) throw new Error("playback_url_failed");
      if (requestId !== requestRef.current || recoveryRef.current !== requestId) return;

      audio.pause();
      audio.src = body.url;
      audio.load();
      await waitForAudioReadiness(audio);
      if (requestId !== requestRef.current || recoveryRef.current !== requestId) return;

      audio.currentTime = pausedAt;
      await audio.play();
      if (requestId === requestRef.current && recoveryRef.current === requestId) {
        setIsPlaying(true);
      }
    } catch {
      if (requestId === requestRef.current && recoveryRef.current === requestId) {
        setIsPlaying(false);
        setError(RESUME_ERROR);
      }
    } finally {
      if (recoveryRef.current === requestId) recoveryRef.current = null;
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [authorId, chapterId, projectId, queue]);

  const playAt = useCallback(async (index: number, retry = false) => {
    const fragment = queue[index];
    const audio = audioRef.current;
    if (!fragment || !audio) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    recoveryRef.current = null;
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio/audiobooks/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/fragments/${encodeURIComponent(fragment.id)}/playback?authorId=${encodeURIComponent(authorId)}`,
        { credentials: "same-origin" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) throw new Error("playback_url_failed");
      if (requestId !== requestRef.current) return;
      audio.src = body.url;
      audio.load();
      await audio.play();
      if (requestId === requestRef.current) setIsPlaying(true);
    } catch {
      if (requestId !== requestRef.current) return;
      if (!retry) {
        retryRef.current = 1;
        void playAtRef.current(index, true);
        return;
      }
      setIsPlaying(false);
      setError(PLAYBACK_ERROR);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [authorId, chapterId, projectId, queue]);

  useEffect(() => {
    playAtRef.current = playAt;
  }, [playAt]);

  const handleEnded = useCallback(() => {
    if (recoveryRef.current !== null) return;
    const transition = audiobookFragmentEndedTransition(queue, currentIndexRef.current);
    if (transition.shouldReset) {
      reset();
      return;
    }
    retryRef.current = 0;
    void playAt(transition.currentIndex);
  }, [playAt, queue, reset]);

  const handleMediaError = useCallback(() => {
    if (recoveryRef.current !== null) return;
    const index = currentIndexRef.current;
    if (retryRef.current === 0) {
      retryRef.current = 1;
      void playAt(index, true);
      return;
    }
    setIsPlaying(false);
    setLoading(false);
    setError(PLAYBACK_ERROR);
  }, [playAt]);

  const handleRetry = useCallback(() => {
    retryRef.current = 0;
    void playAt(currentIndexRef.current);
  }, [playAt]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !queue.length) return;
    if (!audio.paused) {
      requestRef.current += 1;
      recoveryRef.current = null;
      audio.pause();
      setIsPlaying(false);
      setLoading(false);
      return;
    }
    if (audio.currentSrc) {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      recoveryRef.current = null;
      const pausedAt = pausedPlaybackTime(audio);
      try {
        await audio.play();
        if (requestId === requestRef.current) {
          setIsPlaying(true);
          setError(null);
        }
      } catch {
        if (requestId === requestRef.current) {
          void recoverPausedPlayback(currentIndexRef.current, requestId, pausedAt);
        }
      }
      return;
    }
    retryRef.current = 0;
    void playAt(currentIndex);
  };

  if (!queue.length) return null;
  const current = queue[currentIndex];
  return <section className="mt-6 rounded-xl bg-white/5 p-4">
    <audio ref={audioRef} onEnded={handleEnded} onPause={() => setIsPlaying(false)} onPlaying={() => setIsPlaying(true)} onError={handleMediaError} />
    <p className="text-sm text-[#ddd2f5]">Прослушивание главы: {current ? `Фрагмент ${currentIndex + 1} из ${queue.length}` : "—"}</p>
    <div className="mt-3 flex flex-wrap gap-3">
      <button type="button" onClick={() => void handlePlayPause()} disabled={loading} className="rounded-full border border-[#9bdab5] px-4 py-2 text-sm font-semibold text-[#9bdab5]">
        {loading ? "Подготовка…" : isPlaying ? "Пауза" : "Слушать главу"}
      </button>
      <button type="button" onClick={reset} className="rounded-full border border-white/25 px-4 py-2 text-sm">С начала</button>
    </div>
    {error ? <div className="mt-3"><p role="alert" className="text-sm text-[#ffb4b4]">{error}</p><button type="button" onClick={handleRetry} className="mt-2 rounded-full border border-white/25 px-4 py-2 text-sm">Повторить</button></div> : null}
  </section>;
}
