import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const RECOVERY_STAGE_COOKIE = "audiolad_recovery_stage";
export const RECOVERY_INTENT_COOKIE = "audiolad_recovery_intent";

const RECOVERY_COOKIE_MAX_AGE_SECONDS = 10 * 60;
const RECOVERY_INTENT_MAX_AGE_SECONDS = 10 * 60;

type RecoveryStage = {
  tokenHash: string;
  next: string | null;
};

type RecoveryIntent = {
  nonce: string;
  expiresAt: number;
  signature: string;
};

function cookieOptions(path: string, maxAge = RECOVERY_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path,
    maxAge,
  };
}

function intentSecret(): string {
  const secret = process.env.MAX_BOT_TOKEN;
  if (!secret) {
    throw new Error("password_recovery_intent_unavailable");
  }
  return secret;
}

function signIntent(nonce: string, expiresAt: number, userId: string): string {
  return createHmac("sha256", intentSecret())
    .update(`password-recovery-intent:${nonce}:${expiresAt}:${userId}`)
    .digest("base64url");
}

function isTokenHash(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,512}$/.test(value);
}

export function createRecoveryStage(
  tokenHash: string,
  next: string | null,
): string | null {
  if (!isTokenHash(tokenHash)) {
    return null;
  }

  return Buffer.from(JSON.stringify({ tokenHash, next } satisfies RecoveryStage)).toString(
    "base64url",
  );
}

export function readRecoveryStage(
  cookieStore: Pick<ReadonlyRequestCookies, "get">,
): RecoveryStage | null {
  const value = cookieStore.get(RECOVERY_STAGE_COOKIE)?.value;
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as RecoveryStage;
    return isTokenHash(parsed.tokenHash) &&
      (parsed.next === null || typeof parsed.next === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function createRecoveryIntent(userId: string): string {
  const nonce = randomBytes(18).toString("base64url");
  const expiresAt = Date.now() + RECOVERY_INTENT_MAX_AGE_SECONDS * 1000;
  const signature = signIntent(nonce, expiresAt, userId);
  return Buffer.from(JSON.stringify({ nonce, expiresAt, signature } satisfies RecoveryIntent)).toString(
    "base64url",
  );
}

export function hasValidRecoveryIntent(
  cookieStore: Pick<ReadonlyRequestCookies, "get">,
  userId: string,
): boolean {
  const encoded = cookieStore.get(RECOVERY_INTENT_COOKIE)?.value;
  if (!encoded) return false;

  try {
    const { nonce, expiresAt, signature } = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as RecoveryIntent;
    if (
      typeof nonce !== "string" ||
      typeof expiresAt !== "number" ||
      typeof signature !== "string" ||
      expiresAt <= Date.now()
    ) {
      return false;
    }
    const expected = signIntent(nonce, expiresAt, userId);
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const recoveryStageCookieOptions = () =>
  cookieOptions("/auth/recovery");
export const recoveryIntentCookieOptions = () =>
  cookieOptions("/auth/reset-password", RECOVERY_INTENT_MAX_AGE_SECONDS);
