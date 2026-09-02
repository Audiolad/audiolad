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

export function AudiobookChapterPlayer({ authorId, projectId, chapterId, fragments }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestRef = useRef(0);
  const retryRef = useRef(0);
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

  const playAt = useCallback(async (index: number, retry = false) => {
    const fragment = queue[index];
    const audio = audioRef.current;
    if (!fragment || !audio) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
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
  playAtRef.current = playAt;

  const handleEnded = useCallback(() => {
    const transition = audiobookFragmentEndedTransition(queue, currentIndexRef.current);
    if (transition.shouldReset) {
      reset();
      return;
    }
    retryRef.current = 0;
    void playAt(transition.currentIndex);
  }, [playAt, queue, reset]);

  const handleMediaError = useCallback(() => {
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

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !queue.length) return;
    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    if (audio.currentSrc) {
      try {
        await audio.play();
        setIsPlaying(true);
        setError(null);
      } catch {
        setError(PLAYBACK_ERROR);
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
        {loading ? "Подготовка…" : isPlaying ? "Пауза" : "Слушать"}
      </button>
      <button type="button" onClick={reset} className="rounded-full border border-white/25 px-4 py-2 text-sm">С начала</button>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-[#ffb4b4]">{error}</p> : null}
  </section>;
}
