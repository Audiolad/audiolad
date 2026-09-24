"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  captureMaxRecoveryPosition,
  clampMaxSeek,
  decideMaxSignedUrlRecovery,
  hasMaxAudioElementSource,
  isStaleMaxAudioRequest,
  maxTrackSwitchVisibleReset,
  nextMaxTrackIndex,
  previousMaxTrackIndex,
  shouldAcceptMaxAudioResponse,
  shouldApplyMaxSeekRestore,
  shouldIgnoreMaxTeardownMediaError,
  shouldPlayMaxAppliedSource,
  shouldResetMaxRecoveryCycle,
  shouldResumeAfterMaxResign,
  shouldStartMaxPrimaryPlayFetch,
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

function playbackErrorMessage(reason: string): string {
  if (reason === "access_required") {
    return "Для прослушивания нужен доступ к продукту.";
  }
  if (reason === "playback_expired") {
    return "Сессия прослушивания устарела. Закройте и снова откройте АудиоЛад в MAX.";
  }
  return "Не удалось загрузить аудио.";
}

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
  const currentTrackIdRef = useRef<string | null>(null);
  const seekRestoreRef = useRef<(() => void) | null>(null);

  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tracks = session.tracks;
  const currentTrack: MaxPlaybackTrack | null = tracks[trackIndex] ?? null;

  const clearSeekRestore = useCallback(() => {
    const audio = audioRef.current;
    const restore = seekRestoreRef.current;
    if (audio && restore) {
      audio.removeEventListener("loadedmetadata", restore);
    }
    seekRestoreRef.current = null;
  }, []);

  const stopRequests = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clearCurrentMediaSource = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  const invalidatePlayback = useCallback(() => {
    stopRequests();
    generationRef.current += 1;
    clearSeekRestore();
    intendedPlayingRef.current = false;
    clearCurrentMediaSource();
    setIsPlaying(false);
    setIsPreparing(false);
    setCurrentTime(0);
    setDuration(0);
  }, [clearCurrentMediaSource, clearSeekRestore, stopRequests]);

  const applySource = useCallback(
    async (input: {
      url: string;
      resumeAt: number;
      shouldPlay: boolean;
      generation: number;
      trackId: string;
    }) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      clearSeekRestore();
      audio.src = input.url;
      audio.load();
      if (input.resumeAt > 0) {
        const restore = () => {
          if (
            !shouldApplyMaxSeekRestore({
              listenerGeneration: input.generation,
              liveGeneration: generationRef.current,
              listenerTrackId: input.trackId,
              liveTrackId: currentTrackIdRef.current,
            })
          ) {
            return;
          }
          audio.currentTime = clampMaxSeek(
            input.resumeAt,
            audio.duration || input.resumeAt,
          );
          audio.removeEventListener("loadedmetadata", restore);
          if (seekRestoreRef.current === restore) {
            seekRestoreRef.current = null;
          }
        };
        seekRestoreRef.current = restore;
        audio.addEventListener("loadedmetadata", restore);
      }

      const shouldPlayNow = shouldPlayMaxAppliedSource({
        requestedShouldPlay: input.shouldPlay,
        liveIntendedPlaying: intendedPlayingRef.current,
      });
      if (shouldPlayNow) {
        try {
          await audio.play();
        } catch {
          setError("Не удалось начать воспроизведение.");
          setIsPlaying(false);
        }
      }
    },
    [clearSeekRestore],
  );

  const loadTrack = useCallback(
    async (index: number, shouldPlay: boolean, resumeAt = 0) => {
      const track = tracks[index];
      if (!track) {
        return;
      }

      stopRequests();
      clearSeekRestore();
      generationRef.current += 1;
      const generation = generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      recoveryAttemptedRef.current = false;
      hadPlayingRef.current = false;
      currentTrackIdRef.current = track.trackId;
      setError(null);
      setTrackIndex(index);
      const visible = maxTrackSwitchVisibleReset();
      setIsPlaying(visible.isPlaying);
      setCurrentTime(visible.currentTime);
      setDuration(visible.duration);
      setIsPreparing(visible.isPreparing);
      clearCurrentMediaSource();

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
        setError(playbackErrorMessage(result.reason));
        return;
      }

      setIsPreparing(false);
      await applySource({
        url: result.url,
        resumeAt,
        shouldPlay,
        generation,
        trackId: track.trackId,
      });
    },
    [applySource, clearCurrentMediaSource, clearSeekRestore, fetchAudio, stopRequests, tracks],
  );

  const play = useCallback(() => {
    intendedPlayingRef.current = true;
    const audio = audioRef.current;
    const hasSource = audio ? hasMaxAudioElementSource(audio) : false;
    if (hasSource && audio) {
      void audio.play().catch(() => {
        setError("Не удалось начать воспроизведение.");
      });
      return;
    }
    if (
      !shouldStartMaxPrimaryPlayFetch({
        isPreparing,
        hasSource,
      })
    ) {
      return;
    }
    void loadTrack(trackIndex, true);
  }, [isPreparing, loadTrack, trackIndex]);

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
      if (index < 0 || index >= tracks.length) {
        return;
      }
      intendedPlayingRef.current = true;
      void loadTrack(index, true);
    },
    [loadTrack, tracks.length],
  );

  const nextTrack = useCallback(() => {
    const next = nextMaxTrackIndex(trackIndex, tracks.length);
    if (next === null) {
      return;
    }
    selectTrack(next);
  }, [selectTrack, trackIndex, tracks.length]);

  const previousTrack = useCallback(() => {
    const previous = previousMaxTrackIndex(trackIndex, tracks.length);
    if (previous === null) {
      return;
    }
    selectTrack(previous);
  }, [selectTrack, trackIndex, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setIsPlaying(true);
    const onPlaying = () => {
      setIsPlaying(true);
      hadPlayingRef.current = true;
      if (shouldResetMaxRecoveryCycle("playing")) {
        recoveryAttemptedRef.current = false;
      }
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      const next = nextMaxTrackIndex(trackIndex, tracks.length);
      if (next === null) {
        setIsPlaying(false);
        intendedPlayingRef.current = false;
        return;
      }
      intendedPlayingRef.current = true;
      void loadTrack(next, true);
    };
    const onError = () => {
      if (shouldIgnoreMaxTeardownMediaError(audio)) {
        return;
      }

      const decision = decideMaxSignedUrlRecovery({
        mediaErrorCode: audio.error?.code ?? null,
        hadSuccessfulPlaying: hadPlayingRef.current,
        recoveryUrlAttempted: recoveryAttemptedRef.current,
        currentTrackId: currentTrackIdRef.current,
        hasSrc: hasMaxAudioElementSource(audio),
      });

      if (decision.action !== "resign" || !currentTrackIdRef.current) {
        if (decision.errorMessage) {
          setError(decision.errorMessage);
        }
        setIsPlaying(false);
        return;
      }

      recoveryAttemptedRef.current = true;
      const resumeAt = captureMaxRecoveryPosition(audio.currentTime);
      const capturedShouldPlay = shouldResumeAfterMaxResign(intendedPlayingRef.current);
      const generation = generationRef.current;
      const trackId = currentTrackIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      void fetchAudio(trackId, controller.signal).then(async (result) => {
        if (
          controller.signal.aborted ||
          isStaleMaxAudioRequest(generation, generationRef.current)
        ) {
          return;
        }
        if (!result.ok) {
          setError(
            result.reason === "playback_expired"
              ? playbackErrorMessage(result.reason)
              : "Не удалось обновить аудио. Попробуйте ещё раз.",
          );
          return;
        }
        await applySource({
          url: result.url,
          resumeAt,
          shouldPlay: shouldPlayMaxAppliedSource({
            requestedShouldPlay: capturedShouldPlay,
            liveIntendedPlaying: intendedPlayingRef.current,
          }),
          generation,
          trackId,
        });
      });
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [applySource, fetchAudio, loadTrack, trackIndex, tracks.length]);

  useEffect(() => {
    return () => {
      invalidatePlayback();
    };
  }, [invalidatePlayback]);

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
    canGoPrevious: previousMaxTrackIndex(trackIndex, tracks.length) !== null,
    canGoNext: nextMaxTrackIndex(trackIndex, tracks.length) !== null,
    stop: invalidatePlayback,
  };
}
