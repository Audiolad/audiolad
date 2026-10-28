import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";

import type { PeekEdge, PeekReader } from "./peek-closure";
import { BUSINESS_NEW_CLIENT_GRANT_KIND, type GrantRow } from "./policy";

type Row = Record<string, unknown>;

class PeekReadError extends Error {}

function rowsOf(result: { data: unknown; error: unknown }): Row[] {
  if (result.error) throw new PeekReadError("read failed");
  return (result.data ?? []) as Row[];
}

function edgeOf(row: Row): PeekEdge | null {
  return typeof row.email_hash === "string" && typeof row.user_id === "string"
    ? { emailHash: row.email_hash, userId: row.user_id }
    : null;
}

function grantOf(row: Row): GrantRow | null {
  if (typeof row.email_hash !== "string" || typeof row.user_id !== "string") return null;
  if (typeof row.starts_at !== "string" || typeof row.ends_at !== "string") return null;
  return {
    emailHash: row.email_hash,
    userId: row.user_id,
    kind: typeof row.kind === "string" ? row.kind : BUSINESS_NEW_CLIENT_GRANT_KIND,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

/** Shared read-only service-role reader, independent of the visitor's session. */
export function createPeekReader(db: ReturnType<typeof createServiceRoleClient>): PeekReader {
  const kind = BUSINESS_NEW_CLIENT_GRANT_KIND;
  const grantCols = "email_hash, user_id, kind, starts_at, ends_at";

  const select = async (table: "access_grant_identities" | "access_grants", cols: string, userIds: string[], hashes: string[]) => {
    const out: Row[] = [];
    if (userIds.length) out.push(...rowsOf(await db.from(table).select(cols).in("user_id", userIds).eq("kind", kind)));
    if (hashes.length) out.push(...rowsOf(await db.from(table).select(cols).in("email_hash", hashes).eq("kind", kind)));
    return out;
  };

  return {
    async edges(userIds, hashes) {
      const rows = [
        ...(await select("access_grant_identities", "email_hash, user_id", userIds, hashes)),
        ...(await select("access_grants", "email_hash, user_id", userIds, hashes)),
      ];
      return rows.map(edgeOf).filter((edge): edge is PeekEdge => edge !== null);
    },
    async grants(userIds, hashes) {
      return (await select("access_grants", grantCols, userIds, hashes))
        .map(grantOf)
        .filter((grant): grant is GrantRow => grant !== null);
    },
    async paidStamps(emailHash, userId) {
      const rows = rowsOf(await db.from("access_paid_periods").select("paid_until").eq("user_id", userId).eq("kind", kind));
      if (emailHash) rows.push(...rowsOf(await db.from("access_paid_periods").select("paid_until").eq("email_hash", emailHash).eq("kind", kind)));
      return rows.map((row) => row.paid_until).filter((value): value is string => typeof value === "string");
    },
  };
}
