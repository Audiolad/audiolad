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
 * Keyed hash of IP + User-Agent — the fallback binding when the device cookie was cleared.
 * Returns null when there is no server secret or no usable IP (then only the cookie counts).
 */
export function guestCoffeeFallbackHash(input: {
  ip: string | null | undefined;
  userAgent: string | null | undefined;
  secret: string | null | undefined;
}): string | null {
  const ip = input.ip?.trim();
  const secret = input.secret?.trim();
  if (!ip || ip === "unknown" || !secret) return null;
  const ua = (input.userAgent ?? "").trim().slice(0, 512);
  return createHmac("sha256", secret).update(`business-guest-coffee|${ip}|${ua}`).digest("hex");
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
