/**
 * Stable H2 pending-confirmed-play registry.
 *
 * Lives at analytics-module scope (not inside ListenAnalyticsTracker /
 * GlobalPlayerEngine). GlobalPlayerEngine remounts on
 * `${sessionKey}:${playbackInstanceId}` — local contextRef would lose pending
 * A when product/session advances to B before sessionId exists.
 *
 * Only pending confirmed plays live here. Per-track live sticky state
 * (playStarted, progress, completion) stays in the tracker instance.
 */

export type PendingConfirmedPlay = {
  practiceId: string;
  trackId: string;
  /** Path at the moment of confirmed playing (preserved across navigation). */
  path: string;
  /**
   * Listening-context identity (usually listeningStartedAt / first confirmedAt).
   * Distinct contexts of the same track (pause > gap) get distinct pending rows.
   */
  listeningContextId: number;
  confirmedAt: number;
};

export function pendingConfirmedPlayKey(
  practiceId: string,
  trackId: string,
  listeningContextId: number,
): string {
  return `${practiceId}:${trackId}:${listeningContextId}`;
}

export type PendingConfirmedPlaysStore = {
  note(input: {
    practiceId: string;
    trackId: string;
    path: string;
    listeningContextId: number;
    now: number;
  }): PendingConfirmedPlay;
  list(): PendingConfirmedPlay[];
  clear(entry: PendingConfirmedPlay): void;
  hasForTrack(practiceId: string, trackId: string): boolean;
  clearAll(): void;
};

export function createPendingConfirmedPlaysStore(): PendingConfirmedPlaysStore {
  const entries = new Map<string, PendingConfirmedPlay>();

  return {
    note(input) {
      const key = pendingConfirmedPlayKey(
        input.practiceId,
        input.trackId,
        input.listeningContextId,
      );
      const existing = entries.get(key);

      if (existing) {
        return existing;
      }

      const entry: PendingConfirmedPlay = {
        practiceId: input.practiceId,
        trackId: input.trackId,
        path: input.path,
        listeningContextId: input.listeningContextId,
        confirmedAt: input.now,
      };
      entries.set(key, entry);
      return entry;
    },

    list() {
      return [...entries.values()].sort((a, b) => a.confirmedAt - b.confirmedAt);
    },

    clear(entry) {
      entries.delete(
        pendingConfirmedPlayKey(
          entry.practiceId,
          entry.trackId,
          entry.listeningContextId,
        ),
      );
    },

    hasForTrack(practiceId, trackId) {
      for (const entry of entries.values()) {
        if (entry.practiceId === practiceId && entry.trackId === trackId) {
          return true;
        }
      }

      return false;
    },

    clearAll() {
      entries.clear();
    },
  };
}

/** Process-wide store — survives GlobalPlayerEngine remounts. */
const globalPendingConfirmedPlaysStore = createPendingConfirmedPlaysStore();

export function getPendingConfirmedPlaysStore(): PendingConfirmedPlaysStore {
  return globalPendingConfirmedPlaysStore;
}

/** Test-only: wipe the process-wide store between cases. */
export function resetPendingConfirmedPlaysStoreForTests(): void {
  globalPendingConfirmedPlaysStore.clearAll();
}
