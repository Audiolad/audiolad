import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_INTENT_MAX_AGE_SECONDS = 10 * 60;

type RecoveryIntent = {
  nonce: string;
  expiresAt: number;
  signature: string;
};

export function getRecoveryIntentSecret(): string {
  const secret = process.env.PASSWORD_RECOVERY_INTENT_SECRET;
  if (!secret) {
    throw new Error("password_recovery_intent_unavailable");
  }
  return secret;
}

function signIntent(
  secret: string,
  nonce: string,
  expiresAt: number,
  userId: string,
): string {
  return createHmac("sha256", secret)
    .update(`password-recovery-intent:${nonce}:${expiresAt}:${userId}`)
    .digest("base64url");
}

export function createSignedRecoveryIntent(
  secret: string,
  userId: string,
  now = Date.now(),
): string {
  const nonce = randomBytes(18).toString("base64url");
  const expiresAt = now + RECOVERY_INTENT_MAX_AGE_SECONDS * 1000;
  const signature = signIntent(secret, nonce, expiresAt, userId);
  return Buffer.from(
    JSON.stringify({ nonce, expiresAt, signature } satisfies RecoveryIntent),
  ).toString("base64url");
}

export function isSignedRecoveryIntentValid(
  secret: string,
  encoded: string | undefined,
  userId: string,
  now = Date.now(),
): boolean {
  if (!encoded) return false;

  try {
    const { nonce, expiresAt, signature } = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as RecoveryIntent;
    if (
      typeof nonce !== "string" ||
      typeof expiresAt !== "number" ||
      typeof signature !== "string" ||
      expiresAt <= now
    ) {
      return false;
    }
    const expected = signIntent(secret, nonce, expiresAt, userId);
    const received = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return (
      received.length === expectedBuffer.length &&
      timingSafeEqual(received, expectedBuffer)
    );
  } catch {
    return false;
  }
}
