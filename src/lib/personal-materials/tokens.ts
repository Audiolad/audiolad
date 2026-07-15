import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTE_LENGTH = 32;
const TOKEN_HASH_BYTE_LENGTH = 32;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type GeneratedAccessToken = {
  rawToken: string;
  tokenHash: Buffer;
  tokenHashHex: string;
};

export function generateAccessToken(): GeneratedAccessToken {
  const rawToken = randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
  const tokenHash = hashAccessToken(rawToken);

  return {
    rawToken,
    tokenHash,
    tokenHashHex: tokenHash.toString("hex"),
  };
}

export function hashAccessToken(rawToken: string): Buffer {
  const normalized = rawToken.trim();

  if (!isValidAccessTokenFormat(normalized)) {
    throw new Error("invalid_access_token_format");
  }

  return createHash("sha256").update(normalized, "utf8").digest();
}

export function isValidAccessTokenFormat(rawToken: string): boolean {
  const normalized = rawToken.trim();

  if (!normalized || normalized.length < 40 || normalized.length > 64) {
    return false;
  }

  return BASE64URL_PATTERN.test(normalized);
}

export function tokenHashToPostgresBytea(tokenHash: Buffer): string {
  if (tokenHash.length !== TOKEN_HASH_BYTE_LENGTH) {
    throw new Error("invalid_token_hash_length");
  }

  return `\\x${tokenHash.toString("hex")}`;
}

export function postgresByteaToBuffer(value: string): Buffer {
  const trimmed = value.trim();

  if (trimmed.startsWith("\\x")) {
    return Buffer.from(trimmed.slice(2), "hex");
  }

  return Buffer.from(trimmed, "hex");
}

export function areTokenHashesEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function getMinimumTokenEntropyBits(): number {
  return TOKEN_BYTE_LENGTH * 8;
}
