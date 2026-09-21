import { createHash, randomBytes } from "node:crypto";

/** Opaque cookie token (32 bytes hex = 64 chars). Never store author/user ids in the cookie. */
export function createPartnerAttributionToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex digest stored in author_partner_attributions.token_hash. */
export function hashPartnerAttributionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isPartnerAttributionTokenShape(token: string | undefined | null): boolean {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
}
