import { guestTicketNonceHash, verifyGuestTicket } from "./ticket";

export type GuestHookUser = {
  id?: string;
  is_anonymous?: boolean;
  email?: string | null;
  phone?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: { business_guest_ticket?: unknown };
};

// Call only after verifying the Auth webhook signature. Metadata transports a
// capability; neither metadata nor a provider string grants permission by itself.
export async function authorizeAnonymousGuest(input: {
  user: GuestHookUser | undefined;
  enabled: boolean;
  secret: string | undefined;
  now: number;
  consume: (nonceHash: string) => Promise<boolean>;
}): Promise<boolean> {
  if (!input.enabled || input.user?.is_anonymous !== true || input.user.email || input.user.phone) return false;
  const provider = input.user.app_metadata?.provider;
  if (provider && provider !== "anonymous") return false;
  const claims = verifyGuestTicket(input.user.user_metadata?.business_guest_ticket, input.secret, input.now);
  if (!claims) return false;
  try { return await input.consume(guestTicketNonceHash(claims.nonce)); }
  catch { return false; }
}
