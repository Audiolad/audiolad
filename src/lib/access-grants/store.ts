import type { AccessGrantEventName } from "./events";
import type { GrantRow } from "./policy";

export type PaidRow = {
  emailHash: string;
  userId: string;
  kind: string;
  paidUntil: string;
};

export type EventRow = {
  emailHash: string;
  userId: string;
  kind: string;
  name: AccessGrantEventName;
  at: string;
};

export type PlaybackRow = {
  userId: string;
  spaceId: string;
  index: number;
  positionSec: number;
  volume: number;
  updatedAt: string;
};

/**
 * Persistence seam for the shared trial module.
 * Supabase and the in-memory test store both implement it.
 * Grant and playback rows are updated or inserted, never deleted, when a period ends.
 */
export type AccessGrantStore = {
  /** Persist both consumed identities and return the earliest connected original window. */
  resolveGrant(emailHash: string, userId: string, kind: string): Promise<GrantRow | null>;
  insertGrant(row: GrantRow): Promise<"inserted" | "exists">;
  findPaidUntil(emailHash: string, userId: string, kind: string): Promise<string | null>;
  upsertPaid(row: PaidRow): Promise<void>;
  listEvents(emailHash: string, kind: string): Promise<EventRow[]>;
  insertEvent(row: EventRow): Promise<"inserted" | "exists">;
  readPlayback(userId: string, spaceId: string): Promise<PlaybackRow | null>;
  writePlayback(row: PlaybackRow): Promise<void>;
};
