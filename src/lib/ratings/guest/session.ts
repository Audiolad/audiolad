import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { isGuestRatingsTestMode } from "@/lib/ratings/guest/feature";

export const GUEST_RATING_COOKIE_NAME = "al_guest";
export const GUEST_RATING_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const MAX_AGE_MS = GUEST_RATING_COOKIE_MAX_AGE_SECONDS * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Used only when GUEST_RATINGS_TEST_MODE is explicitly on and no
 * GUEST_RATINGS_SESSION_SECRET is configured. Not a production secret.
 */
export const GUEST_RATING_TEST_SESSION_SECRET = "guest-ratings-test-mode-v1";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EnvLike = { [key: string]: string | undefined };

export type GuestRatingSession = {
  guestId: string;
  issuedAtMs: number;
};

export function resolveGuestRatingSessionSecret(
  env: EnvLike = process.env,
): string | null {
  const configured = env.GUEST_RATINGS_SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (isGuestRatingsTestMode(env)) {
    return GUEST_RATING_TEST_SESSION_SECRET;
  }
  return null;
}

export function createGuestRatingId(): string {
  return randomUUID();
}

export function signGuestRatingSession(
  session: GuestRatingSession,
  secret: string,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      g: session.guestId,
      i: session.issuedAtMs,
    }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyGuestRatingSession(
  token: string | null | undefined,
  secret: string,
  nowMs: number,
): GuestRatingSession | null {
  if (!token || !secret) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  const expected = createHmac("sha256", secret)
    .update(parts[0])
    .digest("base64url");
  const actualBuf = Buffer.from(parts[1]);
  const expectedBuf = Buffer.from(expected);
  if (
    actualBuf.length !== expectedBuf.length ||
    !timingSafeEqual(actualBuf, expectedBuf)
  ) {
    return null;
  }

  let parsed: { v?: unknown; g?: unknown; i?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (parsed.v !== 1 || typeof parsed.g !== "string" || !UUID_RE.test(parsed.g)) {
    return null;
  }
  if (typeof parsed.i !== "number" || !Number.isFinite(parsed.i)) {
    return null;
  }

  if (parsed.i > nowMs + FUTURE_SKEW_MS) {
    return null;
  }
  if (nowMs - parsed.i > MAX_AGE_MS) {
    return null;
  }

  return { guestId: parsed.g, issuedAtMs: parsed.i };
}

export function readGuestRatingCookieValue(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    if (trimmed.slice(0, eq).trim() !== GUEST_RATING_COOKIE_NAME) {
      continue;
    }
    const raw = trimmed.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return null;
}

export function guestRatingCookieOptions(secure: boolean): {
  name: typeof GUEST_RATING_COOKIE_NAME;
  httpOnly: true;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
} {
  return {
    name: GUEST_RATING_COOKIE_NAME,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
    maxAge: GUEST_RATING_COOKIE_MAX_AGE_SECONDS,
  };
}
