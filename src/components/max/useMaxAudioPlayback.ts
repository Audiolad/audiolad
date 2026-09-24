"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  captureMaxRecoveryPosition,
  clampMaxSeek,
  decideMaxSignedUrlRecovery,
  isStaleMaxAudioRequest,
  nextMaxTrackIndex,
  previousMaxTrackIndex,
  shouldAcceptMaxAudioResponse,
  shouldResumeAfterMaxResign,
  skipMaxPlayback,
} from "@/lib/max/max-audio-playback";
import type { MaxPlaybackSession, MaxPlaybackTrack } from "@/lib/max/playback-types";

export type MaxAudioFetchResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

type UseMaxAudioPlaybackInput = {
  session: MaxPlaybackSession;
  fetchAudio: (
    trackId: string,
    signal: AbortSignal,
  ) => Promise<MaxAudioFetchResult>;
};

export function useMaxAudioPlayback({
  session,
  fetchAudio,
}: UseMaxAudioPlaybackInput) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const intendedPlayingRef = useRef(false);
  const recoveryAttemptedRef = useRef(false);
  const hadPlayingRef = useRef(false);

  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tracks = session.tracks;
  const currentTrack: MaxPlaybackTrack | null = tracks[trackIndex] ?? null;

  const stopRequests = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const pauseAndClear = useCallback(() => {
    intendedPlayingRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setIsPlaying(false);
    setIsPreparing(false);
  }, []);

  const applySource = useCallback(
    async (url: string, resumeAt: number, shouldPlay: boolean) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      audio.src = url;
      audio.load();
      if (resumeAt > 0) {
        const restore = () => {
          audio.currentTime = clampMaxSeek(resumeAt, audio.duration || resumeAt);
          audio.removeEventListener("loadedmetadata", restore);
        };
        audio.addEventListener("loadedmetadata", restore);
      }

      if (shouldPlay) {
        try {
          await audio.play();
        } catch {
          setError("Не удалось начать воспроизведение.");
          setIsPlaying(false);
        }
      }
    },
    [],
  );

  const loadTrack = useCallback(
    async (index: number, shouldPlay: boolean, resumeAt = 0) => {
      const track = tracks[index];
      if (!track) {
        return;
      }

      stopRequests();
      generationRef.current += 1;
      const generation = generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      recoveryAttemptedRef.current = false;
      hadPlayingRef.current = false;
      setError(null);
      setIsPreparing(true);
      setTrackIndex(index);

      const result = await fetchAudio(track.trackId, controller.signal);
      if (
        !shouldAcceptMaxAudioResponse({
          aborted: controller.signal.aborted,
          requestGeneration: generation,
          liveGeneration: generationRef.current,
        })
      ) {
        return;
      }

      if (!result.ok) {
        setIsPreparing(false);
        setError(
          result.reason === "access_required"
            ? "Для прослушивания нужен доступ к продукту."
            : "Не удалось загрузить аудио.",
        );
        return;
      }

      setIsPreparing(false);
      await applySource(result.url, resumeAt, shouldPlay);
    },
    [applySource, fetchAudio, stopRequests, tracks],
  );

  const play = useCallback(() => {
    intendedPlayingRef.current = true;
    const audio = audioRef.current;
    if (audio?.src) {
      void audio.play().catch(() => {
        setError("Не удалось начать воспроизведение.");
      });
      return;
    }
    void loadTrack(trackIndex, true);
  }, [loadTrack, trackIndex]);

  const pause = useCallback(() => {
    intendedPlayingRef.current = false;
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback((nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = clampMaxSeek(nextTime, audio.duration || duration);
  }, [duration]);

  const skipBy = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = skipMaxPlayback(
      audio.currentTime,
      delta,
      audio.duration || duration,
    );
  }, [duration]);

  const selectTrack = useCallback(
    (index: number) => {
      intendedPlayingRef.current = true;
      void loadTrack(index, true);
    },
    [loadTrack],
  );

  const nextTrack = useCallback(() => {
    selectTrack(nextMaxTrackIndex(trackIndex, tracks.length));
  }, [selectTrack, trackIndex, tracks.length]);

  const previousTrack = useCallback(() => {
    selectTrack(previousMaxTrackIndex(trackIndex, tracks.length));
  }, [selectTrack, trackIndex, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => {
      setIsPlaying(true);
      hadPlayingRef.current = true;
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      intendedPlayingRef.current = false;
    };
    const onError = () => {
      const decision = decideMaxSignedUrlRecovery({
        mediaErrorCode: audio.error?.code ?? null,
        hadSuccessfulPlaying: hadPlayingRef.current,
        recoveryUrlAttempted: recoveryAttemptedRef.current,
        currentTrackId: currentTrack?.trackId ?? null,
        hasSrc: Boolean(audio.src),
      });

      if (decision.action !== "resign" || !currentTrack) {
        if (decision.errorMessage) {
          setError(decision.errorMessage);
        }
        setIsPlaying(false);
        return;
      }

      recoveryAttemptedRef.current = true;
      const resumeAt = captureMaxRecoveryPosition(audio.currentTime);
      const shouldPlay = shouldResumeAfterMaxResign(intendedPlayingRef.current);
      const generation = generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      void fetchAudio(currentTrack.trackId, controller.signal).then(async (result) => {
        if (
          controller.signal.aborted ||
          isStaleMaxAudioRequest(generation, generationRef.current)
        ) {
          return;
        }
        if (!result.ok) {
          setError("Не удалось обновить аудио. Попробуйте ещё раз.");
          return;
        }
        await applySource(result.url, resumeAt, shouldPlay);
      });
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [applySource, currentTrack, fetchAudio]);

  useEffect(() => {
    return () => {
      stopRequests();
      pauseAndClear();
    };
  }, [pauseAndClear, stopRequests]);

  return {
    audioRef,
    currentTrack,
    trackIndex,
    isPlaying,
    isPreparing,
    currentTime,
    duration,
    error,
    play,
    pause,
    seek,
    skipBy,
    selectTrack,
    nextTrack,
    previousTrack,
    stop: () => {
      stopRequests();
      pauseAndClear();
    },
  };
}
