import { createHash, randomBytes } from "node:crypto";

import {
  ACCESS_LINK_TOKEN_BYTE_LENGTH,
  type GeneratedPracticeAccessToken,
  isValidPracticeAccessTokenFormat,
} from "@/lib/products/access-links";

export function hashPracticeAccessToken(rawToken: string): string {
  const normalized = rawToken.trim();

  if (!isValidPracticeAccessTokenFormat(normalized)) {
    throw new Error("invalid_access_token_format");
  }

  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function generatePracticeAccessToken(): GeneratedPracticeAccessToken {
  const rawToken = randomBytes(ACCESS_LINK_TOKEN_BYTE_LENGTH).toString(
    "base64url",
  );
  return {
    rawToken,
    tokenHash: hashPracticeAccessToken(rawToken),
  };
}
