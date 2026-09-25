import { getCachedAnalyticsSessionId } from "@/lib/analytics/client";
import { readAnonymousId } from "@/lib/analytics/identity-storage";
import { resolvePlaybackUsageListeningKey } from "@/lib/analytics/listening-context-store";
import { LISTEN_STATS_HEARTBEAT_MS } from "@/lib/listen/listen-stats-constants";
import type { PlaybackUsagePhase } from "@/lib/listen/playback-usage";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";

export { LISTEN_STATS_HEARTBEAT_MS };

/**
 * Client-side optimization for preview heartbeat gating only.
 * Not a security boundary: server getUser() remains source of truth.
 */
export function readListenStatsClientAuthenticated(
  cookieHeader?: string,
  supabaseUrl?: string,
): boolean {
  const header =
    cookieHeader ??
    (typeof document === "undefined" ? "" : document.cookie);

  if (!header.trim()) {
    return false;
  }

  return hasSupabaseAuthCookie(
    header,
    supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export type ListenStatsHeartbeatPayload = {
  audioItemId: string;
  positionMs: number;
  priorPositionMs?: number | null;
  playbackRate?: number | null;
  practiceId?: string | null;
  phase?: PlaybackUsagePhase;
  clientEventId?: string | null;
  listeningKey?: string | null;
  sessionId?: string | null;
  isPlaying?: boolean;
};

const USAGE_EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPlaybackUsageEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function shouldReportListenStatsHeartbeat(input: {
  isPrivateAudio: boolean;
  isPreviewMode: boolean;
  guestProgressMode: boolean;
  audioItemId: string | null | undefined;
  isAuthenticated?: boolean;
}): boolean {
  if (input.isPrivateAudio || input.guestProgressMode) {
    return false;
  }

  if (input.isPreviewMode && input.isAuthenticated !== true) {
    return false;
  }

  if (!input.audioItemId || input.audioItemId.startsWith("legacy-")) {
    return false;
  }

  return true;
}

/**
 * Product listening-time usage. Wider than rating heartbeats: anonymous catalog
 * playback counts. Private and legacy items stay out. Not a security boundary.
 */
export function shouldReportPlaybackUsageHeartbeat(input: {
  isPrivateAudio: boolean;
  audioItemId: string | null | undefined;
}): boolean {
  if (input.isPrivateAudio) {
    return false;
  }

  if (!input.audioItemId || input.audioItemId.startsWith("legacy-")) {
    return false;
  }

  return true;
}

export function buildListenStatsHeartbeatBody(
  input: ListenStatsHeartbeatPayload,
): Record<string, unknown> {
  const positionMs = Math.max(0, Math.floor(input.positionMs));
  const prior =
    typeof input.priorPositionMs === "number" &&
    Number.isFinite(input.priorPositionMs)
      ? Math.max(0, Math.floor(input.priorPositionMs))
      : null;
  const body: Record<string, unknown> = {
    audio_item_id: input.audioItemId,
    position_ms: positionMs,
  };

  if (prior !== null) {
    body.prior_position_ms = prior;
    body.media_delta_ms = Math.max(0, positionMs - prior);
  }

  if (
    typeof input.playbackRate === "number" &&
    Number.isFinite(input.playbackRate) &&
    input.playbackRate > 0
  ) {
    body.playback_rate = input.playbackRate;
  }

  const anonymousId = readAnonymousId();
  if (anonymousId) {
    body.audiolad_anonymous_id = anonymousId;
  }

  const phase = input.phase ?? "advance";
  const practiceId = input.practiceId?.trim() ?? "";
  const clientEventId = input.clientEventId?.trim() ?? "";

  if (
    practiceId &&
    clientEventId &&
    USAGE_EVENT_ID_PATTERN.test(clientEventId)
  ) {
    const listeningKey =
      input.listeningKey?.trim() ||
      resolvePlaybackUsageListeningKey({
        practiceId,
        audioItemId: input.audioItemId,
        now: Date.now(),
        isPlaying: input.isPlaying !== false && phase !== "track_change",
      });

    body.client_event_id = clientEventId;
    body.listening_key = listeningKey;
    body.playback_phase = phase;

    const sessionId = input.sessionId ?? getCachedAnalyticsSessionId();
    if (sessionId && USAGE_EVENT_ID_PATTERN.test(sessionId)) {
      body.analytics_session_id = sessionId;
    }
  }

  return body;
}

function postListenStats(url: string, payload: string, keepalive: boolean): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive,
    body: payload,
  });
}

export function reportListenStatsHeartbeat(input: {
  apiBase: string;
  audioItemId: string;
  positionMs: number;
  priorPositionMs?: number | null;
  playbackRate?: number | null;
  keepalive?: boolean;
  practiceId?: string | null;
  phase?: PlaybackUsagePhase;
  isPlaying?: boolean;
}): void {
  if (!input.apiBase || input.audioItemId.startsWith("legacy-")) {
    return;
  }

  const clientEventId = createPlaybackUsageEventId();
  const payload = JSON.stringify(
    buildListenStatsHeartbeatBody({
      ...input,
      clientEventId,
    }),
  );
  const url = `${input.apiBase}/listen-stats`;
  const keepalive = input.keepalive === true;

  // Same client_event_id on the single retry. The server unique key, not this
  // memory, is what prevents a timeout from adding the same media delta twice.
  void postListenStats(url, payload, keepalive)
    .then((response) => {
      if (response.ok || response.status < 500 || keepalive) {
        return;
      }

      return postListenStats(url, payload, false);
    })
    .catch(() => {
      if (keepalive) {
        return;
      }

      void postListenStats(url, payload, false).catch(() => {
        // Best-effort: listen-stats must never fail the player.
      });
    });
}
