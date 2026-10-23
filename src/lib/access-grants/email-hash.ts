import { createHash } from "node:crypto";

/** sha256 of the trimmed, lowercased address. The database stores the hash, not the address. */
export function hashAccessEmail(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  if (!trimmed || trimmed.length > 320 || !trimmed.includes("@")) return null;
  return createHash("sha256").update(trimmed).digest("hex");
}
