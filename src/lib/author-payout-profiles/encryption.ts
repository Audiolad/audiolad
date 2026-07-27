/**
 * Application-level AES-256-GCM for author payout profile PII.
 *
 * Never log plaintext, key material, or full ciphertext.
 */

import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const PAYOUT_PROFILE_ENCRYPTION_VERSION = 1 as const;
export const PAYOUT_PROFILE_ENCRYPTION_ALGORITHM = "aes-256-gcm" as const;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export type PayoutProfileEncryptedEnvelope = {
  v: typeof PAYOUT_PROFILE_ENCRYPTION_VERSION;
  kid: string;
  iv: string;
  ct: string;
  tag: string;
};

export type PayoutProfileEncryptionErrorCode =
  | "encryption_key_missing"
  | "encryption_key_invalid"
  | "encryption_key_id_missing"
  | "encryption_envelope_invalid"
  | "encryption_version_unsupported"
  | "encryption_kid_unknown"
  | "encryption_decrypt_failed";

export class PayoutProfileEncryptionError extends Error {
  readonly code: PayoutProfileEncryptionErrorCode;

  constructor(code: PayoutProfileEncryptionErrorCode) {
    super(code);
    this.name = "PayoutProfileEncryptionError";
    this.code = code;
  }
}

export type PayoutProfileEncryptionKeyMaterial = {
  key: Buffer;
  kid: string;
};

function decodeBase64Key(raw: string): Buffer {
  try {
    return Buffer.from(raw, "base64");
  } catch {
    throw new PayoutProfileEncryptionError("encryption_key_invalid");
  }
}

/**
 * Resolve encryption key from environment.
 * Key must be exactly 32 bytes after base64 decode.
 * No fallback keys.
 */
export function resolvePayoutProfileEncryptionKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PayoutProfileEncryptionKeyMaterial {
  const rawKey = env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY?.trim() ?? "";
  const kid = env.AUDIOLAD_PAYOUT_PROFILE_ENCRYPTION_KEY_ID?.trim() ?? "";

  if (!rawKey) {
    throw new PayoutProfileEncryptionError("encryption_key_missing");
  }

  if (!kid) {
    throw new PayoutProfileEncryptionError("encryption_key_id_missing");
  }

  const key = decodeBase64Key(rawKey);

  if (key.length !== KEY_BYTES) {
    throw new PayoutProfileEncryptionError("encryption_key_invalid");
  }

  return { key, kid };
}

export function isPayoutProfileEncryptedEnvelope(
  value: unknown,
): value is PayoutProfileEncryptedEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.v === PAYOUT_PROFILE_ENCRYPTION_VERSION &&
    typeof record.kid === "string" &&
    record.kid.length > 0 &&
    typeof record.iv === "string" &&
    typeof record.ct === "string" &&
    typeof record.tag === "string"
  );
}

export function serializePayoutProfileEncryptedEnvelope(
  envelope: PayoutProfileEncryptedEnvelope,
): string {
  return JSON.stringify(envelope);
}

export function parsePayoutProfileEncryptedEnvelope(
  serialized: string,
): PayoutProfileEncryptedEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new PayoutProfileEncryptionError("encryption_envelope_invalid");
  }

  if (!isPayoutProfileEncryptedEnvelope(parsed)) {
    if (
      parsed &&
      typeof parsed === "object" &&
      "v" in parsed &&
      (parsed as { v: unknown }).v !== PAYOUT_PROFILE_ENCRYPTION_VERSION
    ) {
      throw new PayoutProfileEncryptionError("encryption_version_unsupported");
    }

    throw new PayoutProfileEncryptionError("encryption_envelope_invalid");
  }

  return parsed;
}

export function encryptPayoutProfilePayload(
  plaintextUtf8: string,
  keyMaterial: PayoutProfileEncryptionKeyMaterial = resolvePayoutProfileEncryptionKeyFromEnv(),
): PayoutProfileEncryptedEnvelope {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    PAYOUT_PROFILE_ENCRYPTION_ALGORITHM,
    keyMaterial.key,
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintextUtf8, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  if (tag.length !== TAG_BYTES) {
    throw new PayoutProfileEncryptionError("encryption_decrypt_failed");
  }

  return {
    v: PAYOUT_PROFILE_ENCRYPTION_VERSION,
    kid: keyMaterial.kid,
    iv: iv.toString("base64"),
    ct: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptPayoutProfilePayload(
  envelope: PayoutProfileEncryptedEnvelope,
  keyMaterial: PayoutProfileEncryptionKeyMaterial = resolvePayoutProfileEncryptionKeyFromEnv(),
): string {
  if (envelope.v !== PAYOUT_PROFILE_ENCRYPTION_VERSION) {
    throw new PayoutProfileEncryptionError("encryption_version_unsupported");
  }

  if (envelope.kid !== keyMaterial.kid) {
    throw new PayoutProfileEncryptionError("encryption_kid_unknown");
  }

  let iv: Buffer;
  let ciphertext: Buffer;
  let tag: Buffer;

  try {
    iv = Buffer.from(envelope.iv, "base64");
    ciphertext = Buffer.from(envelope.ct, "base64");
    tag = Buffer.from(envelope.tag, "base64");
  } catch {
    throw new PayoutProfileEncryptionError("encryption_envelope_invalid");
  }

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new PayoutProfileEncryptionError("encryption_envelope_invalid");
  }

  try {
    const decipher = createDecipheriv(
      PAYOUT_PROFILE_ENCRYPTION_ALGORITHM,
      keyMaterial.key,
      iv,
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    throw new PayoutProfileEncryptionError("encryption_decrypt_failed");
  }
}

/** Future rotation helper: decrypt with current key, re-encrypt with next key material. */
export function reencryptPayoutProfileEnvelope(
  serializedEnvelope: string,
  currentKey: PayoutProfileEncryptionKeyMaterial,
  nextKey: PayoutProfileEncryptionKeyMaterial,
): PayoutProfileEncryptedEnvelope {
  const envelope = parsePayoutProfileEncryptedEnvelope(serializedEnvelope);
  const plaintext = decryptPayoutProfilePayload(envelope, currentKey);
  return encryptPayoutProfilePayload(plaintext, nextKey);
}

/** Constant-time compare for tests / health checks without leaking lengths via early exit on content. */
export function safeEqualUtf8(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
