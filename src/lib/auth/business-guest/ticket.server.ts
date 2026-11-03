import "server-only";

import { randomBytes } from "node:crypto";
import { createServiceRoleClient } from "../../supabase/service-role";
import { authorizeAnonymousGuest, type GuestHookUser } from "./authorize";
import { guestTicketNonceHash, issueGuestTicket } from "./ticket";

export function isBusinessGuestAuthEnabled() {
  return process.env.AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED === "1";
}

// No route/action calls this issuer in stage 1. A future guest-start operation
// must enforce CSRF, consent, idempotency and rate limits BEFORE calling it.
// Never return this capability or Auth credentials to the browser.
export async function issueBusinessGuestStartTicket(): Promise<string> {
  if (!isBusinessGuestAuthEnabled()) throw new Error("guest_start_unavailable");
  const secret = process.env.AUDIOLAD_BUSINESS_GUEST_TICKET_SECRET;
  if (!secret) throw new Error("guest_start_unavailable");
  const { ticket, claims } = issueGuestTicket(secret, randomBytes(32).toString("hex"), Math.floor(Date.now() / 1000));
  const { error } = await createServiceRoleClient().from("business_guest_auth_tickets").insert({
    nonce_hash: guestTicketNonceHash(claims.nonce),
    expires_at: new Date(claims.exp * 1000).toISOString(),
  });
  if (error) throw new Error("guest_start_unavailable");
  return ticket;
}

export async function authorizeBusinessGuestUser(user: GuestHookUser | undefined): Promise<boolean> {
  return authorizeAnonymousGuest({
    user,
    enabled: isBusinessGuestAuthEnabled(),
    secret: process.env.AUDIOLAD_BUSINESS_GUEST_TICKET_SECRET,
    now: Math.floor(Date.now() / 1000),
    consume: async (nonceHash) => {
      const { data, error } = await createServiceRoleClient().rpc("consume_business_guest_auth_ticket", { p_nonce_hash: nonceHash });
      return !error && data === true;
    },
  });
}
