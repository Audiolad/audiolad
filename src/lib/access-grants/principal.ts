import { hashAccessEmail } from "./email-hash";
import { isEmailConfirmed } from "./policy";

export type BusinessAccessPrincipal = { userId: string; emailHash: string | null; kind: "email" | "guest" };
export function businessAccessPrincipal(user: {
  id: string; is_anonymous?: boolean; email?: string | null;
  email_confirmed_at?: string | null; confirmed_at?: string | null;
} | null, guestEnabled: boolean): BusinessAccessPrincipal | null {
  if (!user) return null;
  if (user.is_anonymous === true) return guestEnabled ? { userId: user.id, emailHash: null, kind: "guest" } : null;
  if (!isEmailConfirmed(user)) return null;
  const emailHash = hashAccessEmail(user.email);
  return emailHash ? { userId: user.id, emailHash, kind: "email" } : null;
}
