import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { BUSINESS_NO_ACCESS, type BusinessChromeAccess } from "./access-line";
import { hashAccessEmail } from "./email-hash";
import { BUSINESS_NEW_CLIENT_GRANT_KIND, isEmailConfirmed, resolveCustomerAccess, type GrantRow } from "./policy";

type Row = Record<string, unknown>;

function earliest(rows: Row[]): GrantRow | null {
  let best: GrantRow | null = null;
  for (const row of rows) {
    if (typeof row.email_hash !== "string" || typeof row.user_id !== "string") continue;
    if (typeof row.starts_at !== "string" || typeof row.ends_at !== "string") continue;
    const grant: GrantRow = {
      emailHash: row.email_hash,
      userId: row.user_id,
      kind: typeof row.kind === "string" ? row.kind : BUSINESS_NEW_CLIENT_GRANT_KIND,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    };
    if (!best || Date.parse(grant.startsAt) < Date.parse(best.startsAt)) best = grant;
  }
  return best;
}

/**
 * READ-ONLY peek at the signed-in visitor's Business access for the cabinet chrome (guest strip
 * vs calm «Бесплатный доступ до …» line). Unlike activateBusinessTrial / resolve_access_grant it
 * never issues a gift and never writes identity bindings: plain SELECTs by user id and by the
 * address hashes already bound to this user. Any failure falls back to «no access» (the strip
 * then shows as before), so the layout never breaks on this read.
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

    const hashes = new Set<string>();
    const own = hashAccessEmail(user.email);
    if (own) hashes.add(own);
    const bound = await db
      .from("access_grant_identities")
      .select("email_hash")
      .eq("user_id", user.id)
      .eq("kind", kind);
    if (bound.error) return BUSINESS_NO_ACCESS;
    for (const row of (bound.data ?? []) as Row[]) {
      if (typeof row.email_hash === "string") hashes.add(row.email_hash);
    }

    const cols = "email_hash, user_id, kind, starts_at, ends_at";
    const byUser = await db.from("access_grants").select(cols).eq("user_id", user.id).eq("kind", kind);
    if (byUser.error) return BUSINESS_NO_ACCESS;
    const rows: Row[] = [...((byUser.data ?? []) as Row[])];
    const paidStamps: string[] = [];
    const paidByUser = await db.from("access_paid_periods").select("paid_until").eq("user_id", user.id).eq("kind", kind);
    if (paidByUser.error) return BUSINESS_NO_ACCESS;
    for (const row of (paidByUser.data ?? []) as Row[]) if (typeof row.paid_until === "string") paidStamps.push(row.paid_until);

    if (hashes.size > 0) {
      const list = [...hashes];
      const byHash = await db.from("access_grants").select(cols).in("email_hash", list).eq("kind", kind);
      if (byHash.error) return BUSINESS_NO_ACCESS;
      rows.push(...((byHash.data ?? []) as Row[]));
      const paidByHash = await db.from("access_paid_periods").select("paid_until").in("email_hash", list).eq("kind", kind);
      if (paidByHash.error) return BUSINESS_NO_ACCESS;
      for (const row of (paidByHash.data ?? []) as Row[]) if (typeof row.paid_until === "string") paidStamps.push(row.paid_until);
    }

    const paidUntil = paidStamps.length
      ? paidStamps.reduce((max, value) => (Date.parse(value) > Date.parse(max) ? value : max))
      : null;
    const access = resolveCustomerAccess({ now, emailConfirmed: true, grant: earliest(rows), paidUntil });
    if (access.mode !== "trial" && access.mode !== "paid") return { mode: access.mode, endsAt: null };
    return { mode: access.mode, endsAt: access.endsAt };
  } catch {
    return BUSINESS_NO_ACCESS;
  }
}
