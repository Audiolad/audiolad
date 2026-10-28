import type { WorkspacePlayback } from "../business-workspace/playback";

export type PointPlaybackCause = "progress" | "advance" | "owner" | "manual";

/** Only bounded playback movement is accepted from a locked point device. */
export function pointPlaybackAllowed(input: {
  isPoint: boolean;
  pointCanEdit: boolean;
  stored: WorkspacePlayback | null;
  next: Pick<WorkspacePlayback, "index" | "positionSec">;
  cause: unknown;
  now?: number;
}): boolean {
  if (!input.isPoint || input.pointCanEdit) return true;
  const { stored, next, cause } = input;
  if (!stored) return true;
  if (!Number.isInteger(next.index) || next.index < 0 || !Number.isFinite(next.positionSec) || next.positionSec < 0) return false;
  const toleranceSec = 3;
  if (cause === "progress") {
    const timestamp = Date.parse(stored.updatedAt);
    const elapsed = Number.isFinite(timestamp) ? Math.max(0, ((input.now ?? Date.now()) - timestamp) / 1000) : 0;
    return next.index === stored.index
      && next.positionSec >= stored.positionSec - toleranceSec
      && next.positionSec <= stored.positionSec + elapsed + toleranceSec;
  }
  // Residual: a tampered client can fake a natural advance, bounded to one
  // forward step (or wrap to 0) near position 0; cause is not proof of an end.
  if (cause === "advance" || cause === "owner") {
    return (next.index === stored.index + 1 || next.index === 0) && next.positionSec <= toleranceSec;
  }
  return false;
}
