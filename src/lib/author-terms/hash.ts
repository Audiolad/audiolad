import { createHash } from "node:crypto";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function assertAuthorTermsContentHash(
  text: string,
  expectedHash: string,
): void {
  const actual = sha256Hex(text);
  if (actual !== expectedHash) {
    throw new Error(
      `author_terms_content_hash_mismatch expected=${expectedHash} actual=${actual}`,
    );
  }
}
