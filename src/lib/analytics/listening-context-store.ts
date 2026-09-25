/**
 * Shared listening_key for playback usage and ListenAnalyticsTracker.
 *
 * The key format is the existing analytics key
 * (`practiceId:audioItemId:startedAt`). Usage keeps that context across a
 * frozen lock-screen tab while audio is still playing. A real pause longer
 * than LISTENING_SESSION_GAP_MS, a track change, or ended+new session opens
 * a new key. Tracker expiry for audio_play_started is unchanged; this store
 * only publishes the key the tracker already chose and lets the player reuse it.
 */

import { LISTENING_SESSION_GAP_MS } from "@/lib/analytics/constants";
import { buildListeningSessionKey } from "@/lib/analytics/dedup";

export type PublishedListeningKey = {
  practiceId: string;
  audioItemId: string;
  startedAt: number;
  listeningKey: string;
};

type UsageListeningContext = PublishedListeningKey & {
  lastPlayingAt: number;
};

let publishedAnalyticsKey: PublishedListeningKey | null = null;
let usageContext: UsageListeningContext | null = null;

export function publishAnalyticsListeningKey(input: PublishedListeningKey): void {
  publishedAnalyticsKey = input;
}

export function resolvePlaybackUsageListeningKey(input: {
  practiceId: string;
  audioItemId: string;
  now: number;
  isPlaying: boolean;
}): string {
  if (
    usageContext &&
    usageContext.practiceId === input.practiceId &&
    usageContext.audioItemId === input.audioItemId &&
    (input.isPlaying ||
      input.now - usageContext.lastPlayingAt <= LISTENING_SESSION_GAP_MS)
  ) {
    if (input.isPlaying) {
      usageContext.lastPlayingAt = input.now;
    }

    return usageContext.listeningKey;
  }

  let startedAt = input.now;
  let listeningKey = buildListeningSessionKey({
    practiceId: input.practiceId,
    audioItemId: input.audioItemId,
    sessionStartedAt: startedAt,
  });

  if (
    publishedAnalyticsKey &&
    publishedAnalyticsKey.practiceId === input.practiceId &&
    publishedAnalyticsKey.audioItemId === input.audioItemId &&
    input.now - publishedAnalyticsKey.startedAt <= LISTENING_SESSION_GAP_MS &&
    input.now - publishedAnalyticsKey.startedAt >= 0
  ) {
    startedAt = publishedAnalyticsKey.startedAt;
    listeningKey = publishedAnalyticsKey.listeningKey;
  }

  usageContext = {
    practiceId: input.practiceId,
    audioItemId: input.audioItemId,
    startedAt,
    listeningKey,
    lastPlayingAt: input.now,
  };

  return listeningKey;
}

export function resetPlaybackListeningContextForTests(): void {
  publishedAnalyticsKey = null;
  usageContext = null;
}
