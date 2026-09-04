import { LISTEN_STATS_HEARTBEAT_MS } from "@/lib/listen/listen-stats-constants";
import { readAnonymousId } from "@/lib/analytics/identity-storage";

export { LISTEN_STATS_HEARTBEAT_MS };

export type ListenStatsHeartbeatPayload = {
  audioItemId: string;
  positionMs: number;
  priorPositionMs?: number | null;
  playbackRate?: number | null;
};

export function shouldReportListenStatsHeartbeat(input: {
  isPrivateAudio: boolean;
  isPreviewMode: boolean;
  guestProgressMode: boolean;
  audioItemId: string | null | undefined;
}): boolean {
  if (input.isPrivateAudio || input.isPreviewMode || input.guestProgressMode) {
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

  return body;
}

export function reportListenStatsHeartbeat(input: {
  apiBase: string;
  audioItemId: string;
  positionMs: number;
  priorPositionMs?: number | null;
  playbackRate?: number | null;
  keepalive?: boolean;
}): void {
  if (!input.apiBase || input.audioItemId.startsWith("legacy-")) {
    return;
  }

  const body = buildListenStatsHeartbeatBody(input);

  void fetch(`${input.apiBase}/listen-stats`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: input.keepalive === true,
    body: JSON.stringify(body),
  }).catch(() => {
    // Best-effort: listen-stats must never fail the player.
  });
}
