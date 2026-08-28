/**
 * Auth → analytics session sync.
 *
 * TOKEN_REFRESHED and other non-transition events must not re-link.
 * SIGNED_IN is the only event that records signup_completed (canonical owner).
 * Existing sessions (INITIAL_SESSION / getSession) only link ownership.
 */

export type AnalyticsAuthSyncEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "SIGNED_OUT"
  | (string & {});

export type AnalyticsAuthSyncResult = {
  ran: boolean;
  reason:
    | "linked"
    | "signup"
    | "skipped_event"
    | "missing_ids"
    | "inflight"
    | "completed"
    | "failed";
  flow: "link" | "signup" | null;
};

export type AnalyticsAuthSyncHandlers = {
  link: () => Promise<void>;
  signup: () => Promise<boolean>;
};

type PairState = {
  inflight: Promise<AnalyticsAuthSyncResult> | null;
  completed: boolean;
};

export function isAnalyticsAuthLinkEvent(event: string): boolean {
  return event === "INITIAL_SESSION" || event === "SIGNED_IN";
}

export function isAnalyticsAuthSignupEvent(event: string): boolean {
  return event === "SIGNED_IN";
}

export function analyticsAuthPairKey(
  analyticsSessionId: string,
  userId: string,
): string {
  return `${analyticsSessionId}:${userId}`;
}

export function createAnalyticsAuthSyncController() {
  const pairs = new Map<string, PairState>();
  let dedupedCount = 0;

  function getPair(key: string): PairState {
    const existing = pairs.get(key);
    if (existing) {
      return existing;
    }
    const created: PairState = { inflight: null, completed: false };
    pairs.set(key, created);
    return created;
  }

  function logDedupe(reason: "inflight" | "completed", authEvent: string) {
    dedupedCount += 1;
    if (dedupedCount === 1 || dedupedCount % 25 === 0) {
      console.info("analytics_auth_sync", {
        event: "deduped",
        reason,
        auth_event: authEvent,
        deduped_count: dedupedCount,
      });
    }
  }

  async function sync(
    event: AnalyticsAuthSyncEvent,
    input: {
      userId: string | null | undefined;
      analyticsSessionId: string | null | undefined;
      handlers: AnalyticsAuthSyncHandlers;
    },
  ): Promise<AnalyticsAuthSyncResult> {
    if (event === "SIGNED_OUT") {
      pairs.clear();
      return { ran: false, reason: "skipped_event", flow: null };
    }

    if (!isAnalyticsAuthLinkEvent(event)) {
      return { ran: false, reason: "skipped_event", flow: null };
    }

    const userId = typeof input.userId === "string" ? input.userId.trim() : "";
    const analyticsSessionId =
      typeof input.analyticsSessionId === "string"
        ? input.analyticsSessionId.trim()
        : "";

    if (!userId || !analyticsSessionId) {
      return { ran: false, reason: "missing_ids", flow: null };
    }

    const key = analyticsAuthPairKey(analyticsSessionId, userId);
    const pair = getPair(key);

    if (pair.completed) {
      logDedupe("completed", event);
      return { ran: false, reason: "completed", flow: null };
    }

    if (pair.inflight) {
      logDedupe("inflight", event);
      await pair.inflight;
      return { ran: false, reason: "inflight", flow: null };
    }

    const flow: "signup" | "link" = isAnalyticsAuthSignupEvent(event)
      ? "signup"
      : "link";

    const work = (async (): Promise<AnalyticsAuthSyncResult> => {
      try {
        if (flow === "signup") {
          await input.handlers.signup();
        } else {
          await input.handlers.link();
        }
        pair.completed = true;
        return { ran: true, reason: flow === "signup" ? "signup" : "linked", flow };
      } catch (error) {
        console.info("analytics_auth_sync", {
          event: "failed",
          flow,
          message: error instanceof Error ? error.message : "unknown",
        });
        return { ran: false, reason: "failed", flow };
      } finally {
        pair.inflight = null;
      }
    })();

    pair.inflight = work;
    return work;
  }

  return {
    sync,
    getDedupedCount: () => dedupedCount,
    resetForTests() {
      pairs.clear();
      dedupedCount = 0;
    },
  };
}

export const analyticsAuthSync = createAnalyticsAuthSyncController();
