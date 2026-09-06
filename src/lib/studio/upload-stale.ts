import {
  STUDIO_STALE_FAILED_MS,
  STUDIO_STALE_PENDING_REPLACEMENT_MS,
  STUDIO_STALE_PROCESSING_MS,
  STUDIO_STALE_RESERVED_MS,
  STUDIO_STALE_UPLOADING_MS,
} from "./limits";

export type StudioUploadStateForStale =
  | "reserved"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export function studioStaleTtlMs(state: StudioUploadStateForStale): number | null {
  if (state === "ready") return null;
  if (state === "reserved") return STUDIO_STALE_RESERVED_MS;
  if (state === "uploading") return STUDIO_STALE_UPLOADING_MS;
  if (state === "processing") return STUDIO_STALE_PROCESSING_MS;
  if (state === "failed") return STUDIO_STALE_FAILED_MS;
  return null;
}

export function isStudioUploadStale(input: {
  uploadState: StudioUploadStateForStale;
  stateChangedAt: Date;
  now?: Date;
}): boolean {
  const ttl = studioStaleTtlMs(input.uploadState);
  if (ttl == null) return false;
  const now = input.now ?? new Date();
  return now.getTime() - input.stateChangedAt.getTime() > ttl;
}

export function isStudioPendingReplacementStale(input: {
  pendingReservedAt: Date | null;
  now?: Date;
  ttlMs?: number;
}): boolean {
  if (!input.pendingReservedAt) return false;
  const now = input.now ?? new Date();
  const ttl = input.ttlMs ?? STUDIO_STALE_PENDING_REPLACEMENT_MS;
  return now.getTime() - input.pendingReservedAt.getTime() > ttl;
}
