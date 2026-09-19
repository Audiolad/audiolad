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
  createListenTrackerContextState,
  expireListenTrackerContextIfInactive,
  noteListenTrackerPlayingActivity,
  resetListenTrackerContextState,
  shouldAttemptPlayStartedEmit,
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

/**
 * Canonical playback analytics emitter for GlobalAudioPlayer.
 * One audio_play_started per real play of a practiceId+audioItemId in a listening
 * context; track changes A→B reset per-track state; Repeat One loops stay deduped
 * via continuous-session memory; play-before-session waits for sessionId (H2).
 * Listening-session gap is inactivity since last playing activity, not listen age.
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

  // H3: reset per-track analytics state whenever the active audio item (or practice) changes.
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

  // Inactivity gap: only a pause/stop longer than LISTENING_SESSION_GAP_MS opens a
  // new listening context. Long continuous play must not expire on short pause.
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

    // Expire before attempting emit so a long pause (> gap) can open a new context.
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

    if (
      !shouldAttemptPlayStartedEmit({
        trackId,
        isPlaying,
        playStarted: context.playStarted,
        sessionId,
      })
    ) {
      return;
    }

    if (!trackId || !sessionId) {
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

    // Repeat One / continuous same-item loops: suppress duplicate start.
    if (!rememberContinuousListenPlayStarted(practiceId, trackId)) {
      return;
    }

    void trackPlatformEvent({
      sessionId,
      event_name: "audio_play_started",
      path,
      practice_id: practiceId,
      audio_item_id: trackId,
      properties: {
        listening_key: listeningKey,
      },
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
