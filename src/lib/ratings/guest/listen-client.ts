import { readListenStatsClientAuthenticated } from "@/lib/listen/listen-stats-client";

/**
 * MAX and VK players report guest listen samples here so those player
 * files stay free of site listen routes. The server still decides whether
 * a sample counts. A site session skips the request.
 */
export function reportGuestListenSample(input: {
  authorSlug: string;
  productSlug: string;
  audioItemId: string;
  positionMs: number;
  priorPositionMs: number | null;
}): void {
  if (readListenStatsClientAuthenticated()) {
    return;
  }

  const body: Record<string, number | string> = {
    audio_item_id: input.audioItemId,
    position_ms: input.positionMs,
  };
  if (input.priorPositionMs != null) {
    body.prior_position_ms = input.priorPositionMs;
    body.media_delta_ms = Math.max(0, input.positionMs - input.priorPositionMs);
  }

  void fetch(
    `/api/listen/product/${encodeURIComponent(input.authorSlug)}/${encodeURIComponent(input.productSlug)}/listen-stats`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ).catch(() => undefined);
}
