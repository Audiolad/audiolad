import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { BUSINESS_NO_ACCESS, type BusinessChromeAccess } from "./access-line";
import { peekChromeAccessWith } from "./peek-closure";
import { businessAccessPrincipal } from "./principal";
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
    const principal = businessAccessPrincipal(user, process.env.AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED === "1");
    if (!principal) return BUSINESS_NO_ACCESS;
    return await peekBusinessAccessFor(principal, now);
  } catch {
    return BUSINESS_NO_ACCESS;
  }
}

/**
 * Same READ-ONLY peek for a given account (service role). Used by the paired venue device, which
 * plays under the venue owner's gift / paid period without being signed in as the owner.
 * Never issues a gift, never writes. Any failure is «no access».
 */
export async function peekBusinessAccessFor(
  start: { userId: string; emailHash: string | null; kind?: "email" | "guest" },
  now: Date = new Date(),
): Promise<BusinessChromeAccess> {
  try {
    const reader = createPeekReader(createServiceRoleClient());

    return await peekChromeAccessWith(reader, start, now);
  } catch {
    return BUSINESS_NO_ACCESS;
  }
}
