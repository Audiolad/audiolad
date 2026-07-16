"use client";

import { useEffect, useRef } from "react";

import type { AudioProgressMilestoneEvent } from "@/lib/analytics/constants";
import { LISTENING_SESSION_GAP_MS } from "@/lib/analytics/constants";
import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import {
  buildListeningSessionKey,
  createListeningSessionStartedAt,
  hasTrackedListeningMilestone,
  isListeningSessionExpired,
  markListeningMilestoneTracked,
} from "@/lib/analytics/dedup";
import {
  createListeningProgressState,
  getNewlyReachedMilestones,
  isListeningCompleted,
  updateListeningProgressState,
} from "@/lib/analytics/listening";

type ListenAnalyticsTrackerProps = {
  practiceId: string;
  trackId: string | null;
  path: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  programCompleted: boolean;
};

export default function ListenAnalyticsTracker({
  practiceId,
  trackId,
  path,
  currentTime,
  duration,
  isPlaying,
  programCompleted,
}: ListenAnalyticsTrackerProps) {
  const playStartedRef = useRef(false);
  const completionTrackedRef = useRef(false);
  const listeningStartedAtRef = useRef<number | null>(null);
  const listeningSessionKeyRef = useRef<string | null>(null);
  const progressStateRef = useRef(createListeningProgressState());
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!trackId) {
      playStartedRef.current = false;
      listeningStartedAtRef.current = null;
      listeningSessionKeyRef.current = null;
      progressStateRef.current = createListeningProgressState();
      lastTickRef.current = null;
      return;
    }

    if (
      listeningStartedAtRef.current &&
      isListeningSessionExpired(listeningStartedAtRef.current, LISTENING_SESSION_GAP_MS)
    ) {
      playStartedRef.current = false;
      listeningStartedAtRef.current = null;
      listeningSessionKeyRef.current = null;
      progressStateRef.current = createListeningProgressState();
    }
  }, [trackId]);

  useEffect(() => {
    if (!trackId || !isPlaying || playStartedRef.current) {
      return;
    }

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId) {
      return;
    }

    playStartedRef.current = true;

    if (!listeningStartedAtRef.current) {
      listeningStartedAtRef.current = createListeningSessionStartedAt();
    }

    const listeningKey = buildListeningSessionKey({
      practiceId,
      audioItemId: trackId,
      sessionStartedAt: listeningStartedAtRef.current,
    });

    listeningSessionKeyRef.current = listeningKey;

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
  }, [isPlaying, path, practiceId, trackId]);

  useEffect(() => {
    if (!trackId || duration <= 0) {
      return;
    }

    const now = Date.now();
    const previousTick = lastTickRef.current;
    lastTickRef.current = now;

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

    const sessionId = getCachedAnalyticsSessionId();
    const listeningKey = listeningSessionKeyRef.current;

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
      !completionTrackedRef.current &&
      isListeningCompleted(nextState, {
        currentTime,
        duration,
        programCompleted,
      })
    ) {
      if (!hasTrackedListeningMilestone(listeningKey, "audio_completed")) {
        completionTrackedRef.current = true;
        markListeningMilestoneTracked(listeningKey, "audio_completed");

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
    trackId,
  ]);

  useEffect(() => {
    if (!programCompleted) {
      return;
    }

    completionTrackedRef.current = false;
    playStartedRef.current = false;
    listeningStartedAtRef.current = null;
    listeningSessionKeyRef.current = null;
    progressStateRef.current = createListeningProgressState();
    lastTickRef.current = null;
  }, [programCompleted, trackId]);

  return null;
}
