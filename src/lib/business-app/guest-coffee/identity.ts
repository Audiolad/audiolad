/**
 * a8240527 — guest identity for the listening meter. Node-only (crypto), no Next imports,
 * so it is unit-testable. Nothing here is stored in clear text.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

export const GUEST_COFFEE_COOKIE_NAME = "al_biz_guest";
export const GUEST_COFFEE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function createGuestCoffeeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isGuestCoffeeToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function hashGuestCoffeeToken(token: string): string {
  return createHash("sha256").update(`business-guest-coffee:${token}`).digest("hex");
}

/**
 * Network key of a client IP: IPv4 as is (also ::ffff:-mapped), IPv6 by its /64 prefix
 * (one subscriber usually owns a whole /64 and rotates addresses inside it).
 * Returns null for anything that is not a valid IP.
 */
export function guestCoffeeNetworkKey(ip: string | null | undefined): string | null {
  const raw = ip?.trim().toLowerCase();
  if (!raw || raw === "unknown") return null;
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  const v4 = mapped ? mapped[1] : raw;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4)) {
    return v4.split(".").every((part) => Number(part) <= 255) ? `v4:${v4}` : null;
  }
  if (!raw.includes(":") || !/^[0-9a-f:]+$/.test(raw)) return null;
  const halves = raw.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => g.length === 0 || g.length > 4)) return null;
  return `v6:${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/**
 * Keyed hash of the client network (IP only — never client-controlled headers such as
 * User-Agent). A separate, shared counter on the server: clearing the device cookie or
 * juggling several cookies on the same network does not reset it.
 * Returns null when there is no server secret or no valid IP (then only the cookie counts).
 */
export function guestCoffeeNetworkHash(input: {
  ip: string | null | undefined;
  secret: string | null | undefined;
}): string | null {
  const key = guestCoffeeNetworkKey(input.ip);
  const secret = input.secret?.trim();
  if (!key || !secret) return null;
  return createHmac("sha256", secret).update(`business-guest-coffee|${key}`).digest("hex");
}

export function guestCoffeeCookieOptions(secure: boolean) {
  return {
    name: GUEST_COFFEE_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: GUEST_COFFEE_COOKIE_MAX_AGE_SECONDS,
  };
}
