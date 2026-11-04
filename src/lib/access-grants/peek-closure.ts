/**
 * Read-only mirror of `resolve_access_grant` (supabase/migrations/20270120120000_access_grants_and_workspace.sql)
 * for the cabinet chrome: walks the same identity graph (addresses <-> accounts, through
 * access_grant_identities and access_grants of one kind) without writing the identity binding,
 * then picks the earliest grant exactly like the SQL (starts_at, ends_at, email_hash).
 * Paid periods are read like supabase-store.findPaidUntil: own address hash + own account.
 */
import { BUSINESS_NO_ACCESS, type BusinessChromeAccess } from "./access-line";
import { resolveCustomerAccess, type GrantRow } from "./policy";

export type PeekEdge = { emailHash: string; userId: string };

export type PeekReader = {
  /** Identity edges (bindings and grants of this kind) touching any of the given accounts / hashes. */
  edges(userIds: string[], emailHashes: string[]): Promise<PeekEdge[]>;
  /** Grants of this kind for any of the given accounts / hashes. */
  grants(userIds: string[], emailHashes: string[]): Promise<GrantRow[]>;
  /** paid_until stamps for the own address hash and own account. */
  paidStamps(emailHash: string | null, userId: string): Promise<string[]>;
};

/** Safety cap: a real identity graph has a handful of nodes. */
export const PEEK_MAX_ROUNDS = 25;

export async function identityClosure(
  reader: PeekReader,
  start: { userId: string; emailHash: string | null; kind?: "email" | "guest" },
): Promise<{ userIds: string[]; emailHashes: string[] }> {
  const users = new Set<string>([start.userId]);
  const hashes = new Set<string>(start.emailHash ? [start.emailHash] : []);
  let frontierUsers = [start.userId];
  let frontierHashes = start.emailHash ? [start.emailHash] : [];
  for (let round = 0; round < PEEK_MAX_ROUNDS && (frontierUsers.length || frontierHashes.length); round += 1) {
    const edges = await reader.edges(frontierUsers, frontierHashes);
    frontierUsers = [];
    frontierHashes = [];
    for (const edge of edges) {
      if (!users.has(edge.userId)) {
        users.add(edge.userId);
        frontierUsers.push(edge.userId);
      }
      if (!hashes.has(edge.emailHash)) {
        hashes.add(edge.emailHash);
        frontierHashes.push(edge.emailHash);
      }
    }
  }
  return { userIds: [...users], emailHashes: [...hashes] };
}

export function earliestGrant(rows: GrantRow[]): GrantRow | null {
  const sorted = [...rows].sort(
    (a, b) => {
      const clock = Date.parse(a.startsAt) - Date.parse(b.startsAt) || Date.parse(a.endsAt) - Date.parse(b.endsAt);
      if (clock) return clock;
      // PostgreSQL ORDER BY email_hash defaults to NULLS LAST.
      if (a.emailHash === null) return b.emailHash === null ? 0 : 1;
      if (b.emailHash === null) return -1;
      return a.emailHash < b.emailHash ? -1 : a.emailHash > b.emailHash ? 1 : 0;
    },
  );
  return sorted[0] ?? null;
}

/** Raw periods shared by the cabinet chrome and the public licence presenter. */
export async function peekAccessPeriodsWith(
  reader: PeekReader,
  start: { userId: string; emailHash: string | null; kind?: "email" | "guest" },
): Promise<{ grant: GrantRow | null; paidUntil: string | null }> {
  // No email closure for a guest: user-id lookup only, no identity traversal.
  // A paid period settled without an email is stored by account, so it is read by account.
  if (start.kind === "guest") {
    const grant = earliestGrant(await reader.grants([start.userId], []));
    return { grant, paidUntil: latestStamp(await reader.paidStamps(null, start.userId)) };
  }
  const closure = await identityClosure(reader, start);
  const grant = earliestGrant(await reader.grants(closure.userIds, closure.emailHashes));
  return { grant, paidUntil: latestStamp(await reader.paidStamps(start.emailHash, start.userId)) };
}

function latestStamp(stamps: string[]): string | null {
  return stamps.length
    ? stamps.reduce((max, value) => (Date.parse(value) > Date.parse(max) ? value : max))
    : null;
}

export async function peekChromeAccessWith(
  reader: PeekReader,
  start: { userId: string; emailHash: string | null; kind?: "email" | "guest" },
  now: Date,
): Promise<BusinessChromeAccess> {
  const { grant, paidUntil } = await peekAccessPeriodsWith(reader, start);
  const access = resolveCustomerAccess({ now, emailConfirmed: true, grant, paidUntil });
  if (access.mode === "grace" && access.endsAt && access.playbackUntil) {
    return { mode: "grace", endsAt: access.endsAt, graceEndsAt: access.playbackUntil };
  }
  if (access.mode === "trial" || access.mode === "paid") {
    return { mode: access.mode, endsAt: access.endsAt };
  }
  // An ended gift keeps its end instant so Главная can show the terms. It is not a live period.
  if (access.mode === "offer" && access.endsAt) return { mode: "offer", endsAt: access.endsAt };
  return { ...BUSINESS_NO_ACCESS, mode: access.mode };
}
