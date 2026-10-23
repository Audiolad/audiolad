import {
  evaluateListenStatsTick,
  type ListenStatsTickResult,
  type ListenStatsTickState,
} from "@/lib/listen/listen-stats";
import { guestRatingListenThresholdMs } from "@/lib/ratings/guest/threshold";

export type GuestListenItemCredit = {
  audioItemId: string;
  highWaterMs: number;
  itemDurationMs: number | null;
};

export type GuestListenState = ListenStatsTickState & {
  items: GuestListenItemCredit[];
  /** Practice-level accessible length used only to choose the threshold. */
  accessibleTotalMs: number | null;
};

export type GuestListenTickInput = {
  audioItemId: string;
  positionMs: number;
  clientMediaDeltaMs?: number | null;
  playbackRate?: number | null;
  nowMs: number;
  allowEligibility: boolean;
  itemDurationMs: number | null;
  accessibleTotalMs: number | null;
};

/**
 * Same MEDIA-TIME rules as registered listen stats, plus:
 * - already heard positions on this item are not credited again (rewind,
 *   replay, looping);
 * - credit on an item cannot pass a known item duration;
 * - practice total cannot pass the known accessible length;
 * - eligibility uses 30s, or the short-fragment rule when that length
 *   is shorter than 30s.
 * Client playback rate still cannot raise the wall-clock budget.
 */
export function evaluateGuestListenTick(
  state: GuestListenState | null,
  input: GuestListenTickInput,
): ListenStatsTickResult & {
  items: GuestListenItemCredit[];
  accessibleTotalMs: number | null;
} {
  const base = evaluateListenStatsTick(state, {
    audioItemId: input.audioItemId,
    positionMs: input.positionMs,
    clientMediaDeltaMs: input.clientMediaDeltaMs,
    playbackRate: input.playbackRate,
    nowMs: input.nowMs,
    allowEligibility: false,
  });

  const items = state?.items.map((item) => ({ ...item })) ?? [];
  let item = items.find((row) => row.audioItemId === input.audioItemId);
  if (!item) {
    item = {
      audioItemId: input.audioItemId,
      highWaterMs: 0,
      itemDurationMs: null,
    };
    items.push(item);
  }

  if (
    input.itemDurationMs != null &&
    input.itemDurationMs > 0 &&
    (item.itemDurationMs == null || input.itemDurationMs < item.itemDurationMs)
  ) {
    item.itemDurationMs = Math.floor(input.itemDurationMs);
  }

  const accessibleTotalMs =
    state?.accessibleTotalMs != null && input.accessibleTotalMs != null
      ? Math.min(state.accessibleTotalMs, Math.floor(input.accessibleTotalMs))
      : (state?.accessibleTotalMs ??
        (input.accessibleTotalMs != null
          ? Math.floor(input.accessibleTotalMs)
          : null));

  let acceptedMs = base.acceptedMs;
  if (acceptedMs > 0 && state) {
    const heardUntil = Math.max(state.lastPositionMs, item.highWaterMs);
    const unheard = Math.max(0, base.lastPositionMs - heardUntil);
    acceptedMs = Math.min(acceptedMs, unheard);

    if (item.itemDurationMs != null) {
      const room = Math.max(0, item.itemDurationMs - item.highWaterMs);
      acceptedMs = Math.min(acceptedMs, room);
    }

    if (accessibleTotalMs != null) {
      const room = Math.max(0, accessibleTotalMs - state.realListenedMs);
      acceptedMs = Math.min(acceptedMs, room);
    }
  } else {
    acceptedMs = 0;
  }

  if (acceptedMs > 0 && state) {
    const heardUntil = Math.max(state.lastPositionMs, item.highWaterMs);
    item.highWaterMs = Math.max(item.highWaterMs, heardUntil + acceptedMs);
  }

  const realListenedMs = (state?.realListenedMs ?? 0) + acceptedMs;
  const threshold = guestRatingListenThresholdMs(accessibleTotalMs);
  let ratingEligibleAt = state?.ratingEligibleAt ?? null;
  if (
    input.allowEligibility &&
    ratingEligibleAt == null &&
    realListenedMs >= threshold
  ) {
    ratingEligibleAt = new Date(input.nowMs).toISOString();
  }

  return {
    acceptedMs,
    realListenedMs,
    ratingEligibleAt,
    lastAudioItemId: base.lastAudioItemId,
    lastPositionMs: base.lastPositionMs,
    lastReportedAt: base.lastReportedAt,
    createdAt: base.createdAt,
    items,
    accessibleTotalMs,
  };
}
