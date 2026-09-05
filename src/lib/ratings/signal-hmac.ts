import { createHmac } from "node:crypto";

type EnvLike = { [key: string]: string | undefined };

export const RATING_SIGNAL_HMAC_VERSION = 1 as const;

/**
 * Versioned HMAC for rating security metadata.
 * Stores `v1:<hex>` only. Never logs the secret or the raw signal.
 */
export function hmacRatingSignal(
  kind: "ip" | "device",
  value: string | null | undefined,
  env: EnvLike = process.env,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "unknown") {
    return null;
  }

  const secret =
    env.RATINGS_SIGNAL_HMAC_SECRET?.trim() ||
    env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    return null;
  }

  const digest = createHmac("sha256", secret)
    .update(`ratings:${kind}:v${RATING_SIGNAL_HMAC_VERSION}:`, "utf8")
    .update(trimmed, "utf8")
    .digest("hex");

  return `v${RATING_SIGNAL_HMAC_VERSION}:${digest}`;
}
