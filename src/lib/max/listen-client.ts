import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_LISTEN_STATS_PATH } from "@/lib/max/host";
import { readListenStatsClientAuthenticated } from "@/lib/listen/listen-stats-client";

/**
 * Linked MAX listeners accrue practice_listen_stats through the MAX host.
 * Apex Supabase cookies are absent in the mini-app; guest samples cannot set
 * rating_eligible_at for a registered user id.
 */
export function reportMaxLinkedListenSample(input: {
  authorSlug: string;
  productSlug: string;
  audioItemId: string;
  positionMs: number;
  priorPositionMs: number | null;
}): void {
  if (readListenStatsClientAuthenticated()) {
    return;
  }

  const initData = readMaxInitData();
  if (!initData) {
    return;
  }

  const body: Record<string, number | string> = {
    initData,
    authorSlug: input.authorSlug,
    productSlug: input.productSlug,
    audioItemId: input.audioItemId,
    positionMs: input.positionMs,
  };
  if (input.priorPositionMs != null) {
    body.priorPositionMs = input.priorPositionMs;
    body.mediaDeltaMs = Math.max(0, input.positionMs - input.priorPositionMs);
  }

  void fetch(MAX_LISTEN_STATS_PATH, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}