import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { extractRouteOrderId } from "@/lib/payments/payment-api";

export const CHECKOUT_TOKEN_VERSION = 1 as const;
export const CHECKOUT_TOKEN_PURPOSE = "audiolad:checkout-status:v1" as const;
export const DEFAULT_CHECKOUT_TOKEN_TTL_SECONDS = 48 * 60 * 60;

export type CheckoutTokenPayload = {
  v: typeof CHECKOUT_TOKEN_VERSION;
  purpose: typeof CHECKOUT_TOKEN_PURPOSE;
  orderId: string;
  nonce: string;
  exp: number;
};

export type SignedCheckoutToken = {
  payload: CheckoutTokenPayload;
  token: string;
};

export type CheckoutTokenVerificationError =
  | "invalid_token_format"
  | "invalid_token_signature"
  | "invalid_token_payload"
  | "token_expired"
  | "order_id_mismatch";

function getCheckoutTokenSecret(): string {
  const secret =
    process.env.CHECKOUT_STATUS_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new Error("checkout_status_secret_not_configured");
  }

  return secret;
}

function encodePayload(payload: CheckoutTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): CheckoutTokenPayload {
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as CheckoutTokenPayload;

  if (
    parsed.v !== CHECKOUT_TOKEN_VERSION ||
    parsed.purpose !== CHECKOUT_TOKEN_PURPOSE ||
    typeof parsed.orderId !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.exp !== "number"
  ) {
    throw new Error("invalid_token_payload");
  }

  const orderId = extractRouteOrderId(parsed.orderId);

  if (!orderId) {
    throw new Error("invalid_token_payload");
  }

  return {
    ...parsed,
    orderId,
  };
}

function signEncodedPayload(encodedPayload: string): string {
  return createHmac("sha256", getCheckoutTokenSecret())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

export function createSignedCheckoutToken(
  orderId: string,
  ttlSeconds: number = DEFAULT_CHECKOUT_TOKEN_TTL_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignedCheckoutToken {
  const normalizedOrderId = extractRouteOrderId(orderId);

  if (!normalizedOrderId) {
    throw new Error("invalid_order_id");
  }

  const payload: CheckoutTokenPayload = {
    v: CHECKOUT_TOKEN_VERSION,
    purpose: CHECKOUT_TOKEN_PURPOSE,
    orderId: normalizedOrderId,
    nonce: randomBytes(16).toString("base64url"),
    exp: nowSeconds + ttlSeconds,
  };

  const encodedPayload = encodePayload(payload);
  const signature = signEncodedPayload(encodedPayload);

  return {
    payload,
    token: `${encodedPayload}.${signature}`,
  };
}

export function verifySignedCheckoutToken(
  token: string,
  expectedOrderId?: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
):
  | { ok: true; payload: CheckoutTokenPayload }
  | { ok: false; error: CheckoutTokenVerificationError } {
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

  let payload: CheckoutTokenPayload;

  try {
    payload = decodePayload(encodedPayload);
  } catch {
    return { ok: false, error: "invalid_token_payload" };
  }

  if (payload.exp <= nowSeconds) {
    return { ok: false, error: "token_expired" };
  }

  if (expectedOrderId) {
    const normalizedExpected = extractRouteOrderId(expectedOrderId);

    if (!normalizedExpected || normalizedExpected !== payload.orderId) {
      return { ok: false, error: "order_id_mismatch" };
    }
  }

  return { ok: true, payload };
}

export function buildCheckoutResultQuery(
  orderId: string,
  token: string,
  extraParams?: Record<string, string>,
): string {
  const params = new URLSearchParams({
    order_id: orderId,
    token,
  });

  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) {
        params.set(key, value);
      }
    }
  }

  return params.toString();
}

export function buildCheckoutResultPath(
  orderId: string,
  token: string,
  extraParams?: Record<string, string>,
): string {
  return `/checkout/result?${buildCheckoutResultQuery(orderId, token, extraParams)}`;
}

export function getCheckoutTokenFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const value = metadata?.checkout_token;

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

export function isStoredCheckoutTokenValidForOrder(
  metadata: Record<string, unknown> | null | undefined,
  orderId: string,
): boolean {
  const token = getCheckoutTokenFromMetadata(metadata);

  if (!token) {
    return false;
  }

  const verification = verifySignedCheckoutToken(token, orderId);
  return verification.ok;
}
