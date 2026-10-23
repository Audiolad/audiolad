import { accessGrantEventIsUnique, type AccessGrantEventName } from "./events";
import type { GrantRow } from "./policy";
import type { AccessGrantStore, EventRow, PaidRow, PlaybackRow } from "./store";

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** In-memory store for tests. Unique like the migration: one grant per email and per user. */
export function createMemoryAccessGrantStore(): AccessGrantStore & {
  grants: GrantRow[];
  paid: PaidRow[];
  events: EventRow[];
  playback: PlaybackRow[];
} {
  const grants: GrantRow[] = [];
  const paid: PaidRow[] = [];
  const events: EventRow[] = [];
  const playback: PlaybackRow[] = [];

  return {
    grants,
    paid,
    events,
    playback,
    async findGrantByEmail(emailHash, kind) {
      return grants.find((row) => row.emailHash === emailHash && row.kind === kind) ?? null;
    },
    async findGrantByUser(userId, kind) {
      return grants.find((row) => row.userId === userId && row.kind === kind) ?? null;
    },
    async insertGrant(row) {
      const emailTaken = grants.some((item) => item.emailHash === row.emailHash && item.kind === row.kind);
      const userTaken = grants.some((item) => item.userId === row.userId && item.kind === row.kind);
      if (emailTaken || userTaken) return "exists";
      grants.push({ ...row });
      return "inserted";
    },
    async findPaidUntil(emailHash, userId, kind) {
      const rows = paid.filter(
        (row) => row.kind === kind && (row.emailHash === emailHash || row.userId === userId),
      );
      return rows.reduce<string | null>((max, row) => later(max, row.paidUntil), null);
    },
    async upsertPaid(row) {
      const index = paid.findIndex((item) => item.emailHash === row.emailHash && item.kind === row.kind);
      if (index >= 0) paid[index] = { ...row };
      else paid.push({ ...row });
    },
    async listEvents(emailHash, kind) {
      return events.filter((row) => row.emailHash === emailHash && row.kind === kind);
    },
    async insertEvent(row) {
      if (
        accessGrantEventIsUnique(row.name) &&
        events.some((item) => item.emailHash === row.emailHash && item.kind === row.kind && item.name === row.name)
      ) {
        return "exists";
      }
      events.push({ ...row });
      return "inserted";
    },
    async readPlayback(userId, spaceId) {
      return playback.find((row) => row.userId === userId && row.spaceId === spaceId) ?? null;
    },
    async writePlayback(row) {
      const index = playback.findIndex((item) => item.userId === row.userId && item.spaceId === row.spaceId);
      if (index >= 0) playback[index] = { ...row };
      else playback.push({ ...row });
    },
  };
}

export type { AccessGrantEventName };
