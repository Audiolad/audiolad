import { resolvePlaybackPreviewWindow } from "@/lib/listen/preview-window";
import {
  positiveDurationMs,
  resolveGuestAccessibleTotalMs,
  type GuestListenAccessKind,
} from "@/lib/ratings/guest/threshold";

export type GuestAudioDurationRow = {
  id: string;
  durationSeconds: number | null;
  previewStartMs: number | null;
  previewEndMs: number | null;
};

function trackMs(row: GuestAudioDurationRow): number | null {
  return positiveDurationMs(
    row.durationSeconds == null ? null : row.durationSeconds * 1000,
  );
}

function previewMs(row: GuestAudioDurationRow): number {
  const window = resolvePlaybackPreviewWindow(
    {
      previewStartMs: row.previewStartMs,
      previewEndMs: row.previewEndMs,
    },
    trackMs(row),
  );
  return Math.max(0, window.endMs - window.startMs);
}

/**
 * Practice-level length and the current item cap. Both come from stored
 * audio metadata. A client-supplied duration is ignored by the caller.
 */
export function resolveGuestListenDurations(input: {
  kind: GuestListenAccessKind;
  currentItemId: string;
  items: GuestAudioDurationRow[];
}): { accessibleTotalMs: number | null; itemDurationMs: number | null } {
  const current = input.items.find((item) => item.id === input.currentItemId);
  if (input.kind === "preview") {
    const windows = input.items.map((item) => previewMs(item));
    return {
      accessibleTotalMs: resolveGuestAccessibleTotalMs({
        kind: "preview",
        previewDurationMs: windows.reduce((sum, value) => sum + value, 0),
        trackDurationMs: [],
      }),
      itemDurationMs: current ? previewMs(current) : null,
    };
  }

  return {
    accessibleTotalMs: resolveGuestAccessibleTotalMs({
      kind: "full",
      previewDurationMs: null,
      trackDurationMs: input.items.map((item) => trackMs(item)),
    }),
    itemDurationMs: current ? trackMs(current) : null,
  };
}
