export type WorkspacePlayback = {
  index: number;
  positionSec: number;
  volume: number;
  updatedAt: string;
};

export const WORKSPACE_PLAYBACK_STORAGE_KEY = "audiolad-business-workspace-playback";

const DEFAULT_VOLUME = 0.8;

export function clampWorkspacePlayback(
  input: Partial<WorkspacePlayback> | null | undefined,
  trackCount: number,
): WorkspacePlayback {
  const volume =
    typeof input?.volume === "number" && Number.isFinite(input.volume)
      ? Math.min(1, Math.max(0, input.volume))
      : DEFAULT_VOLUME;
  const maxIndex = Math.max(0, trackCount - 1);
  const index =
    typeof input?.index === "number" && Number.isFinite(input.index)
      ? Math.min(maxIndex, Math.max(0, Math.floor(input.index)))
      : 0;
  const positionSec =
    typeof input?.positionSec === "number" && Number.isFinite(input.positionSec)
      ? Math.min(86_399, Math.max(0, input.positionSec))
      : 0;
  const updatedAt = typeof input?.updatedAt === "string" ? input.updatedAt : new Date(0).toISOString();
  return { index, positionSec, volume, updatedAt };
}

export function newerPlayback(
  left: WorkspacePlayback | null,
  right: WorkspacePlayback | null,
): WorkspacePlayback | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left.updatedAt) >= Date.parse(right.updatedAt) ? left : right;
}

export function playbackStorageKey(spaceId: string): string {
  return `${WORKSPACE_PLAYBACK_STORAGE_KEY}:${spaceId}`;
}
