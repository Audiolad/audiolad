import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const GUEST_TICKET_PURPOSE = "business_guest_start";
export const GUEST_TICKET_TTL_SECONDS = 120;
export type GuestTicketClaims = { v: 1; purpose: string; nonce: string; iat: number; exp: number };

export function guestTicketNonceHash(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}

// Clock and entropy are explicit inputs so this module has no environment or IO.
export function issueGuestTicket(secret: string, nonce: string, now: number) {
  if (Buffer.byteLength(secret) < 32 || !/^[a-f0-9]{64}$/.test(nonce) || !Number.isSafeInteger(now)) {
    throw new Error("guest_start_unavailable");
  }
  const claims: GuestTicketClaims = {
    v: 1, purpose: GUEST_TICKET_PURPOSE, nonce, iat: now, exp: now + GUEST_TICKET_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return { ticket: `${body}.${signature}`, claims };
}

export function verifyGuestTicket(ticket: unknown, secret: string | undefined, now: number): GuestTicketClaims | null {
  if (!secret || Buffer.byteLength(secret) < 32 || typeof ticket !== "string" || ticket.length > 1024) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [body, signature] = parts;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (c.v !== 1 || c.purpose !== GUEST_TICKET_PURPOSE || typeof c.nonce !== "string"
      || !/^[a-f0-9]{64}$/.test(c.nonce) || !Number.isSafeInteger(now)
      || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp)
      || c.iat > now || c.exp <= now || c.exp - c.iat !== GUEST_TICKET_TTL_SECONDS) return null;
    return c;
  } catch { return null; }
}
