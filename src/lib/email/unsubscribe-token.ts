import { createHmac, timingSafeEqual } from "node:crypto";

import { validateEmailFormat } from "@/lib/auth/email/validate-format";

export const AUTHOR_MARKETING_UNSUBSCRIBE_PURPOSE = "author_marketing" as const;

const TOKEN_VERSION = 1;

type UnsubscribePayload = {
  v: number;
  e: string;
  p: typeof AUTHOR_MARKETING_UNSUBSCRIBE_PURPOSE;
  exp: number;
};

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));

  try {
    return Buffer.from(padded + pad, "base64");
  } catch {
    return null;
  }
}

export function signUnsubscribeToken(input: {
  normalizedEmail: string;
  secret: string;
  expiresAt: Date;
}): string | null {
  const secret = input.secret.trim();
  const email = validateEmailFormat(input.normalizedEmail);

  if (!secret || !email.ok) {
    return null;
  }

  const payload: UnsubscribePayload = {
    v: TOKEN_VERSION,
    e: email.normalizedEmail,
    p: AUTHOR_MARKETING_UNSUBSCRIBE_PURPOSE,
    exp: Math.floor(input.expiresAt.getTime() / 1000),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest();

  return `${encoded}.${base64UrlEncode(signature)}`;
}

export function verifyUnsubscribeToken(input: {
  token: string;
  secret: string;
  now?: Date;
}): { ok: true; normalizedEmail: string } | { ok: false; code: "invalid" | "expired" } {
  const secret = input.secret.trim();
  const token = input.token.trim();

  if (!secret || !token || token.length > 2000) {
    return { ok: false, code: "invalid" };
  }

  const parts = token.split(".");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, code: "invalid" };
  }

  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const actual = base64UrlDecode(parts[1]);

  if (!actual || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, code: "invalid" };
  }

  const payloadRaw = base64UrlDecode(parts[0]);

  if (!payloadRaw) {
    return { ok: false, code: "invalid" };
  }

  let payload: UnsubscribePayload;

  try {
    payload = JSON.parse(payloadRaw.toString("utf8")) as UnsubscribePayload;
  } catch {
    return { ok: false, code: "invalid" };
  }

  if (
    payload.v !== TOKEN_VERSION ||
    payload.p !== AUTHOR_MARKETING_UNSUBSCRIBE_PURPOSE ||
    typeof payload.exp !== "number" ||
    typeof payload.e !== "string"
  ) {
    return { ok: false, code: "invalid" };
  }

  const email = validateEmailFormat(payload.e);

  if (!email.ok) {
    return { ok: false, code: "invalid" };
  }

  const now = input.now ?? new Date();

  if (payload.exp * 1000 <= now.getTime()) {
    return { ok: false, code: "expired" };
  }

  return { ok: true, normalizedEmail: email.normalizedEmail };
}

export function buildUnsubscribeUrl(siteOrigin: string, token: string): string | null {
  const origin = siteOrigin.trim().replace(/\/$/, "");

  if (!origin || token.includes(" ") || /[\r\n]/.test(token)) {
    return null;
  }

  try {
    const url = new URL("/email/unsubscribe", origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return null;
  }
}

export type UnsubscribeSuppressionPlan = {
  already: boolean;
  normalizedEmail: string;
  scope: "author_marketing";
  reason: "unsubscribe";
  source: "user_unsubscribe";
};

export function planAuthorMarketingUnsubscribe(input: {
  normalizedEmail: string;
  existing: readonly {
    normalizedEmail: string;
    scope: string;
    reason: string;
    expiresAt?: string | null;
  }[];
  now?: Date;
}): UnsubscribeSuppressionPlan {
  const now = (input.now ?? new Date()).getTime();
  const already = input.existing.some((entry) => {
    if (entry.normalizedEmail !== input.normalizedEmail) {
      return false;
    }

    if (entry.scope !== "author_marketing" || entry.reason !== "unsubscribe") {
      return false;
    }

    if (!entry.expiresAt) {
      return true;
    }

    const expires = Date.parse(entry.expiresAt);
    return !Number.isFinite(expires) || expires > now;
  });

  return {
    already,
    normalizedEmail: input.normalizedEmail,
    scope: "author_marketing",
    reason: "unsubscribe",
    source: "user_unsubscribe",
  };
}
