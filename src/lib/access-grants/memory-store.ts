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

  const bindings: { emailHash: string; userId: string; kind: string }[] = [];
  function resolve(emailHash: string, userId: string, kind: string): GrantRow | null {
    if (!bindings.some((b) => b.emailHash === emailHash && b.userId === userId && b.kind === kind)) {
      bindings.push({ emailHash, userId, kind });
    }
    const emails = new Set([emailHash]);
    const users = new Set([userId]);
    const edges = [...bindings, ...grants].filter((b) => b.kind === kind);
    let changed = true;
    while (changed) {
      const size = emails.size + users.size;
      for (const edge of edges) {
        if (emails.has(edge.emailHash) || users.has(edge.userId)) {
          emails.add(edge.emailHash);
          users.add(edge.userId);
        }
      }
      changed = size !== emails.size + users.size;
    }
    return grants.filter((g) => g.kind === kind && (emails.has(g.emailHash) || users.has(g.userId)))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || Date.parse(a.endsAt) - Date.parse(b.endsAt) || a.emailHash.localeCompare(b.emailHash))[0] ?? null;
  }

  return {
    grants,
    paid,
    events,
    playback,
    async resolveGrant(emailHash, userId, kind) {
      return resolve(emailHash, userId, kind);
    },
    async insertGrant(row) {
      if (resolve(row.emailHash, row.userId, row.kind)) return "exists";
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
      if (index >= 0) paid[index] = { ...paid[index], paidUntil: later(paid[index].paidUntil, row.paidUntil)! };
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
