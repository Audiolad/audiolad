import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { BUSINESS_NO_ACCESS, type BusinessChromeAccess } from "./access-line";
import { hashAccessEmail } from "./email-hash";
import { peekChromeAccessWith, type PeekEdge, type PeekReader } from "./peek-closure";
import { BUSINESS_NEW_CLIENT_GRANT_KIND, isEmailConfirmed, type GrantRow } from "./policy";

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

/**
 * READ-ONLY peek at the signed-in visitor's Business access for the cabinet chrome (guest strip
 * vs calm «Бесплатный доступ до …» line). Unlike activateBusinessTrial / resolve_access_grant it
 * never issues a gift and never writes identity bindings: plain SELECTs that walk the same
 * identity graph as resolve_access_grant (see peek-closure.ts). Any failure falls back to
 * «no access» (the strip then shows as before), so the layout never breaks on this read.
 */
export async function peekBusinessChromeAccess(now: Date = new Date()): Promise<BusinessChromeAccess> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isEmailConfirmed(user)) return BUSINESS_NO_ACCESS;
    const kind = BUSINESS_NEW_CLIENT_GRANT_KIND;
    const db = createServiceRoleClient();
    const grantCols = "email_hash, user_id, kind, starts_at, ends_at";

    const select = async (table: "access_grant_identities" | "access_grants", cols: string, userIds: string[], hashes: string[]) => {
      const out: Row[] = [];
      if (userIds.length) out.push(...rowsOf(await db.from(table).select(cols).in("user_id", userIds).eq("kind", kind)));
      if (hashes.length) out.push(...rowsOf(await db.from(table).select(cols).in("email_hash", hashes).eq("kind", kind)));
      return out;
    };

    const reader: PeekReader = {
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

    return await peekChromeAccessWith(reader, { userId: user.id, emailHash: hashAccessEmail(user.email) ?? null }, now);
  } catch {
    return BUSINESS_NO_ACCESS;
  }
}
