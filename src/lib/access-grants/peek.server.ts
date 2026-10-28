import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { BUSINESS_NO_ACCESS, type BusinessChromeAccess } from "./access-line";
import { hashAccessEmail } from "./email-hash";
import { peekChromeAccessWith } from "./peek-closure";
import { isEmailConfirmed } from "./policy";
import { createPeekReader } from "./peek-reader.server";

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
    const reader = createPeekReader(createServiceRoleClient());

    return await peekChromeAccessWith(reader, { userId: user.id, emailHash: hashAccessEmail(user.email) ?? null }, now);
  } catch {
    return BUSINESS_NO_ACCESS;
  }
}
