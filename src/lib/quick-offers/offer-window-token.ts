import { createHmac, timingSafeEqual } from "node:crypto";

export const OFFER_WINDOW_TOKEN_VERSION = 1 as const;
export const OFFER_WINDOW_TOKEN_PURPOSE = "audiolad:quick-offer-window:v1" as const;
export const OFFER_WINDOW_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;
export const OFFER_WINDOW_COOKIE_PREFIX = "al_qo_";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OfferWindowTokenPayload = {
  v: typeof OFFER_WINDOW_TOKEN_VERSION;
  purpose: typeof OFFER_WINDOW_TOKEN_PURPOSE;
  offerId: string;
  windowExpiresAt: number;
  durationSeconds: number;
  issuedAt: number;
  tokenExp: number;
};

export type SignedOfferWindow = {
  payload: OfferWindowTokenPayload;
  token: string;
};

export type OfferWindowVerificationError =
  | "invalid_token_format"
  | "invalid_token_signature"
  | "invalid_token_payload"
  | "token_expired"
  | "offer_id_mismatch";

function getOfferWindowSecret(): string {
  const secret =
    process.env.CHECKOUT_STATUS_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new Error("offer_window_secret_not_configured");
  }

  return secret;
}

function encodePayload(payload: OfferWindowTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): OfferWindowTokenPayload {
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as OfferWindowTokenPayload;

  if (
    parsed.v !== OFFER_WINDOW_TOKEN_VERSION ||
    parsed.purpose !== OFFER_WINDOW_TOKEN_PURPOSE ||
    typeof parsed.offerId !== "string" ||
    !UUID_PATTERN.test(parsed.offerId) ||
    typeof parsed.windowExpiresAt !== "number" ||
    typeof parsed.durationSeconds !== "number" ||
    typeof parsed.issuedAt !== "number" ||
    typeof parsed.tokenExp !== "number"
  ) {
    throw new Error("invalid_token_payload");
  }

  return {
    ...parsed,
    offerId: parsed.offerId.toLowerCase(),
  };
}

function signEncodedPayload(encodedPayload: string): string {
  return createHmac("sha256", getOfferWindowSecret())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

export function buildOfferWindowCookieName(offerId: string): string {
  return `${OFFER_WINDOW_COOKIE_PREFIX}${offerId.trim().toLowerCase()}`;
}

export function createSignedOfferWindow(input: {
  offerId: string;
  durationSeconds: number;
  nowSeconds?: number;
  windowExpiresAt?: number;
}): SignedOfferWindow {
  const offerId = input.offerId.trim().toLowerCase();

  if (!UUID_PATTERN.test(offerId)) {
    throw new Error("invalid_offer_id");
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const durationSeconds = Math.max(1, Math.floor(input.durationSeconds));
  const windowExpiresAt =
    input.windowExpiresAt ?? nowSeconds + durationSeconds;

  const payload: OfferWindowTokenPayload = {
    v: OFFER_WINDOW_TOKEN_VERSION,
    purpose: OFFER_WINDOW_TOKEN_PURPOSE,
    offerId,
    windowExpiresAt,
    durationSeconds,
    issuedAt: nowSeconds,
    tokenExp: nowSeconds + OFFER_WINDOW_COOKIE_TTL_SECONDS,
  };

  const encodedPayload = encodePayload(payload);
  const signature = signEncodedPayload(encodedPayload);

  return {
    payload,
    token: `${encodedPayload}.${signature}`,
  };
}

export function verifySignedOfferWindow(
  token: string,
  expectedOfferId?: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
):
  | { ok: true; payload: OfferWindowTokenPayload }
  | { ok: false; error: OfferWindowVerificationError } {
  try {
    const [encodedPayload, signature] = token.split(".");

    if (!encodedPayload || !signature) {
      return { ok: false, error: "invalid_token_format" };
    }

    const expectedSignature = signEncodedPayload(encodedPayload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expectedSignature);

    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return { ok: false, error: "invalid_token_signature" };
    }

    const payload = decodePayload(encodedPayload);

    if (payload.tokenExp <= nowSeconds) {
      return { ok: false, error: "token_expired" };
    }

    if (expectedOfferId) {
      const normalizedExpected = expectedOfferId.trim().toLowerCase();

      if (
        !UUID_PATTERN.test(normalizedExpected) ||
        normalizedExpected !== payload.offerId
      ) {
        return { ok: false, error: "offer_id_mismatch" };
      }
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, error: "invalid_token_payload" };
  }
}

export function offerWindowExpiresAtIso(payload: OfferWindowTokenPayload): string {
  return new Date(payload.windowExpiresAt * 1000).toISOString();
}

export function parseCookieHeaderValue(
  cookieHeader: string | null | undefined,
  cookieName: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const name = trimmed.slice(0, separator);

    if (name !== cookieName) {
      continue;
    }

    const raw = trimmed.slice(separator + 1);

    try {
      return decodeURIComponent(raw);
    } catch {
      return raw || null;
    }
  }

  return null;
}

export function readSignedOfferWindowFromCookieHeader(
  cookieHeader: string | null | undefined,
  offerId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
):
  | { ok: true; payload: OfferWindowTokenPayload }
  | { ok: false; error: OfferWindowVerificationError | "missing_cookie" } {
  const raw = parseCookieHeaderValue(
    cookieHeader,
    buildOfferWindowCookieName(offerId),
  );

  if (!raw) {
    return { ok: false, error: "missing_cookie" };
  }

  return verifySignedOfferWindow(raw, offerId, nowSeconds);
}

/**
 * Server-authoritative window for charge decisions.
 * Unsigned / missing / forged cookies do not grant promo.
 * An expired-but-valid token still identifies the visitor window (promo off).
 */
export function resolveServerOfferWindowExpiresAt(input: {
  offerId: string;
  cookieHeader: string | null | undefined;
  nowSeconds?: number;
}): string | null {
  const verified = readSignedOfferWindowFromCookieHeader(
    input.cookieHeader,
    input.offerId,
    input.nowSeconds,
  );

  if (!verified.ok) {
    return null;
  }

  return offerWindowExpiresAtIso(verified.payload);
}

export function issueOrReuseOfferWindow(input: {
  offerId: string;
  durationSeconds: number;
  existingToken?: string | null;
  nowSeconds?: number;
}): SignedOfferWindow {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (input.existingToken) {
    const verified = verifySignedOfferWindow(
      input.existingToken,
      input.offerId,
      nowSeconds,
    );

    if (verified.ok) {
      return {
        payload: verified.payload,
        token: input.existingToken,
      };
    }
  }

  return createSignedOfferWindow({
    offerId: input.offerId,
    durationSeconds: input.durationSeconds,
    nowSeconds,
  });
}

export function buildOfferWindowCookieHeader(input: {
  offerId: string;
  token: string;
  maxAgeSeconds?: number;
}): string {
  const name = buildOfferWindowCookieName(input.offerId);
  const maxAge = input.maxAgeSeconds ?? OFFER_WINDOW_COOKIE_TTL_SECONDS;
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${name}=${input.token}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
