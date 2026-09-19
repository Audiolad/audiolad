"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import type { AudioProgressMilestoneEvent } from "@/lib/analytics/constants";
import { LISTENING_SESSION_GAP_MS } from "@/lib/analytics/constants";
import {
  getCachedAnalyticsSessionId,
  subscribeCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import {
  buildListeningSessionKey,
  createListeningSessionStartedAt,
  hasTrackedListeningMilestone,
  markListeningMilestoneTracked,
} from "@/lib/analytics/dedup";
import {
  clearPendingConfirmedPlay,
  createListenTrackerContextState,
  expireListenTrackerContextIfInactive,
  hasPendingConfirmedPlayForTrack,
  listPendingConfirmedPlays,
  noteListenTrackerPlayingActivity,
  notePendingConfirmedPlay,
  resetListenTrackerContextState,
  shouldAttemptPlayStartedEmit,
  shouldRecordPendingConfirmedPlay,
  type PendingConfirmedPlay,
} from "@/lib/analytics/listen-tracker-context";
import {
  createListeningProgressState,
  getNewlyReachedMilestones,
  isListeningCompleted,
  updateListeningProgressState,
} from "@/lib/analytics/listening";
import {
  rememberContinuousListenCompleted,
  rememberContinuousListenPlayStarted,
  touchContinuousListenSessionActivity,
} from "@/lib/listen/repeat-analytics";

type ListenAnalyticsTrackerProps = {
  practiceId: string;
  trackId: string | null;
  path: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  programCompleted: boolean;
};

function emitPlayStarted(input: {
  sessionId: string;
  practiceId: string;
  trackId: string;
  path: string;
  listeningKey: string;
  /** Wall time for continuous-session expiry between distinct listening contexts. */
  continuousAt?: number;
}): void {
  if (
    !rememberContinuousListenPlayStarted(
      input.practiceId,
      input.trackId,
      input.continuousAt,
    )
  ) {
    return;
  }

  void trackPlatformEvent({
    sessionId: input.sessionId,
    event_name: "audio_play_started",
    path: input.path,
    practice_id: input.practiceId,
    audio_item_id: input.trackId,
    properties: {
      listening_key: input.listeningKey,
    },
  });
}

/**
 * Canonical playback analytics emitter for GlobalAudioPlayer.
 * audio_play_started follows confirmed player isPlaying (HTMLMediaElement
 * `playing` / valid adopted-playing), never play() intent alone.
 * H2: confirmed play before sessionId is stored in the process-stable pending
 * store (survives GlobalPlayerEngine remount) and flushed when session arrives,
 * preserving original path and distinct listening contexts; survives programCompleted.
 */
export default function ListenAnalyticsTracker({
  practiceId,
  trackId,
  path,
  currentTime,
  duration,
  isPlaying,
  programCompleted,
}: ListenAnalyticsTrackerProps) {
  const contextRef = useRef(createListenTrackerContextState());
  const progressStateRef = useRef(createListeningProgressState());
  const lastTickRef = useRef<number | null>(null);
  const trackedPracticeIdRef = useRef<string | null>(null);
  const trackedTrackIdRef = useRef<string | null>(null);

  const sessionId = useSyncExternalStore(
    subscribeCachedAnalyticsSessionId,
    getCachedAnalyticsSessionId,
    () => null,
  );

  // H3: reset per-track sticky state on audio item change. Pending confirmed
  // plays for prior tracks/contexts are kept until session flush.
  useEffect(() => {
    const practiceChanged = trackedPracticeIdRef.current !== practiceId;
    const trackChanged = trackedTrackIdRef.current !== trackId;

    if (!practiceChanged && !trackChanged) {
      return;
    }

    trackedPracticeIdRef.current = practiceId;
    trackedTrackIdRef.current = trackId;
    resetListenTrackerContextState(contextRef.current);
    progressStateRef.current = createListeningProgressState();
    lastTickRef.current = null;
  }, [practiceId, trackId]);

  useEffect(() => {
    if (!trackId) {
      return;
    }

    const now = Date.now();
    if (
      expireListenTrackerContextIfInactive(
        contextRef.current,
        now,
        LISTENING_SESSION_GAP_MS,
      )
    ) {
      progressStateRef.current = createListeningProgressState();
      lastTickRef.current = null;
    }
  }, [trackId, isPlaying]);

  useEffect(() => {
    const context = contextRef.current;
    const now = Date.now();

    if (
      expireListenTrackerContextIfInactive(
        context,
        now,
        LISTENING_SESSION_GAP_MS,
      )
    ) {
      progressStateRef.current = createListeningProgressState();
      lastTickRef.current = null;
    }

    // H2: remember confirmed playing before session exists (not play intent).
    if (
      shouldRecordPendingConfirmedPlay({
        trackId,
        isPlaying,
        playStarted: context.playStarted,
        sessionId,
      }) &&
      trackId
    ) {
      notePendingConfirmedPlay(context, {
        practiceId,
        trackId,
        path,
        now,
      });
      return;
    }

    if (!sessionId) {
      return;
    }

    // Flush every pending confirmed play (prior path + distinct contexts).
    const pending = listPendingConfirmedPlays();

    for (const entry of pending) {
      flushPendingEntry({
        context,
        entry,
        sessionId,
        currentPracticeId: practiceId,
        currentTrackId: trackId,
        now,
      });
    }

    if (
      !shouldAttemptPlayStartedEmit({
        trackId,
        practiceId,
        isPlaying,
        playStarted: context.playStarted,
        sessionId,
        hasPendingForCurrentTrack: hasPendingConfirmedPlayForTrack(
          practiceId,
          trackId ?? "",
        ),
      })
    ) {
      return;
    }

    if (!trackId) {
      return;
    }

    context.playStarted = true;

    if (!context.listeningStartedAt) {
      context.listeningStartedAt = createListeningSessionStartedAt();
    }

    const listeningKey = buildListeningSessionKey({
      practiceId,
      audioItemId: trackId,
      sessionStartedAt: context.listeningStartedAt,
    });

    context.listeningSessionKey = listeningKey;
    noteListenTrackerPlayingActivity(context, now);

    emitPlayStarted({
      sessionId,
      practiceId,
      trackId,
      path,
      listeningKey,
      continuousAt: now,
    });
  }, [isPlaying, path, practiceId, sessionId, trackId]);

  useEffect(() => {
    if (!trackId || duration <= 0) {
      return;
    }

    const now = Date.now();
    const previousTick = lastTickRef.current;
    lastTickRef.current = now;
    const context = contextRef.current;

    if (isPlaying) {
      touchContinuousListenSessionActivity(now);
      noteListenTrackerPlayingActivity(context, now);

      if (
        shouldRecordPendingConfirmedPlay({
          trackId,
          isPlaying,
          playStarted: context.playStarted,
          sessionId,
        })
      ) {
        notePendingConfirmedPlay(context, {
          practiceId,
          trackId,
          path,
          now,
        });
      }
    }

    const deltaSeconds =
      isPlaying && previousTick ? Math.min(5, (now - previousTick) / 1000) : 0;

    const previousState = progressStateRef.current;
    const nextState = updateListeningProgressState(previousState, {
      currentTime,
      duration,
      isPlaying,
      deltaSeconds,
    });

    progressStateRef.current = nextState;

    const listeningKey = context.listeningSessionKey;

    if (!sessionId || !listeningKey) {
      return;
    }

    const milestones = getNewlyReachedMilestones(previousState, nextState);

    for (const milestone of milestones) {
      if (hasTrackedListeningMilestone(listeningKey, milestone)) {
        continue;
      }

      markListeningMilestoneTracked(listeningKey, milestone);

      void trackPlatformEvent({
        sessionId,
        event_name: milestone as AudioProgressMilestoneEvent,
        path,
        practice_id: practiceId,
        audio_item_id: trackId,
        properties: {
          listening_key: listeningKey,
        },
      });
    }

    if (
      !context.completionTracked &&
      isListeningCompleted(nextState, {
        currentTime,
        duration,
        programCompleted,
      })
    ) {
      if (!hasTrackedListeningMilestone(listeningKey, "audio_completed")) {
        context.completionTracked = true;
        markListeningMilestoneTracked(listeningKey, "audio_completed");

        if (!rememberContinuousListenCompleted(practiceId, trackId)) {
          return;
        }

        void trackPlatformEvent({
          sessionId,
          event_name: "audio_completed",
          path,
          practice_id: practiceId,
          audio_item_id: trackId,
          properties: {
            listening_key: listeningKey,
          },
        });
      }
    }
  }, [
    currentTime,
    duration,
    isPlaying,
    path,
    practiceId,
    programCompleted,
    sessionId,
    trackId,
  ]);

  // programCompleted resets sticky per-track state but must NOT destroy H2 pending.
  useEffect(() => {
    if (!programCompleted) {
      return;
    }

    resetListenTrackerContextState(contextRef.current);
    progressStateRef.current = createListeningProgressState();
    lastTickRef.current = null;
  }, [programCompleted, trackId]);

  return null;
}

function flushPendingEntry(input: {
  context: ReturnType<typeof createListenTrackerContextState>;
  entry: PendingConfirmedPlay;
  sessionId: string;
  currentPracticeId: string;
  currentTrackId: string | null;
  now: number;
}): void {
  const { context, entry, sessionId, currentPracticeId, currentTrackId, now } =
    input;

  clearPendingConfirmedPlay(entry);

  const listeningKey = buildListeningSessionKey({
    practiceId: entry.practiceId,
    audioItemId: entry.trackId,
    sessionStartedAt: entry.listeningContextId,
  });

  const isCurrentTrack =
    entry.practiceId === currentPracticeId && entry.trackId === currentTrackId;

  if (isCurrentTrack) {
    context.playStarted = true;
    context.listeningStartedAt = entry.listeningContextId;
    context.listeningSessionKey = listeningKey;
    noteListenTrackerPlayingActivity(context, now);
  }

  emitPlayStarted({
    sessionId,
    practiceId: entry.practiceId,
    trackId: entry.trackId,
    path: entry.path,
    listeningKey,
    continuousAt: entry.confirmedAt,
  });
}
