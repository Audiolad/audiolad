import "server-only";

import {
  createSignedRecoveryIntent,
  getRecoveryIntentSecret,
  isSignedRecoveryIntentValid,
  RECOVERY_INTENT_MAX_AGE_SECONDS,
} from "./recovery-intent-crypto";

export const RECOVERY_STAGE_COOKIE = "audiolad_recovery_stage";
export const RECOVERY_INTENT_COOKIE = "audiolad_recovery_intent";

const RECOVERY_COOKIE_MAX_AGE_SECONDS = 10 * 60;

type RecoveryStage = {
  tokenHash: string;
  next: string | null;
};

export type RecoveryCookieReader = {
  get(name: string): { value: string } | undefined;
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
  cookieStore: RecoveryCookieReader,
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

export function createRecoveryIntent(userId: string, now = Date.now()): string {
  return createSignedRecoveryIntent(getRecoveryIntentSecret(), userId, now);
}

export function hasValidRecoveryIntent(
  cookieStore: RecoveryCookieReader,
  userId: string,
  now = Date.now(),
): boolean {
  try {
    return isSignedRecoveryIntentValid(
      getRecoveryIntentSecret(),
      cookieStore.get(RECOVERY_INTENT_COOKIE)?.value,
      userId,
      now,
    );
  } catch {
    return false;
  }
}

export const recoveryStageCookieOptions = () =>
  cookieOptions("/auth/recovery");
export const recoveryIntentCookieOptions = () =>
  cookieOptions("/auth/reset-password", RECOVERY_INTENT_MAX_AGE_SECONDS);
