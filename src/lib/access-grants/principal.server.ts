import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createPeekReader } from "./peek-reader.server";
import { peekAccessPeriodsWith } from "./peek-closure";
import { resolveCustomerAccess } from "./policy";
import type { BusinessAccessPrincipal } from "./principal";

/** Guests read the bootstrap grant and their own paid period. No activation, email binding or events. */
export async function readGuestBusinessAccess(principal: BusinessAccessPrincipal, now = new Date()) {
  const { grant, paidUntil } = await peekAccessPeriodsWith(createPeekReader(createServiceRoleClient()), principal);
  return { access: resolveCustomerAccess({ now, emailConfirmed: true, grant, paidUntil }) };
}
