import { createHmac } from "node:crypto";

type EnvLike = { [key: string]: string | undefined };

export const RATING_SIGNAL_HMAC_VERSION = 1 as const;

/**
 * Versioned HMAC for rating security metadata (not access control).
 * Uses ONLY `RATINGS_SIGNAL_HMAC_SECRET`. Missing/empty secret → null;
 * do not fall back to `SUPABASE_SERVICE_ROLE_KEY` and never store raw IP/device.
 *
 * Production needs a stable random `RATINGS_SIGNAL_HMAC_SECRET`.
 * Future rotation: bump `RATING_SIGNAL_HMAC_VERSION` (stored prefix `vN:`).
 * Old rows keep their prior prefix. Do not silently change what `v1:` means
 * by rotating a shared service-role key.
 *
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

  const secret = env.RATINGS_SIGNAL_HMAC_SECRET?.trim();
  if (!secret) {
    return null;
  }

  const digest = createHmac("sha256", secret)
    .update(`ratings:${kind}:v${RATING_SIGNAL_HMAC_VERSION}:`, "utf8")
    .update(trimmed, "utf8")
    .digest("hex");

  return `v${RATING_SIGNAL_HMAC_VERSION}:${digest}`;
}
