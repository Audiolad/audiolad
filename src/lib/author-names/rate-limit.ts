import { createHash } from "node:crypto";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";

import {
  AUTHOR_PUBLIC_NAME_IP_RATE_LIMIT,
  AUTHOR_PUBLIC_NAME_RATE_LIMIT,
  AUTHOR_PUBLIC_NAME_RATE_WINDOW_MS,
} from "./public-name";

/** True when this signed-in user or their address has used the live-check budget. */
export function isAuthorPublicNameCheckRateLimited(
  request: Request,
  userId: string,
): boolean {
  const ipHash = createHash("sha256")
    .update(getTrustedClientIp(request))
    .digest("hex")
    .slice(0, 16);
  const userAllowed = checkAnalyticsRateLimit(
    `author-public-name:${userId}`,
    AUTHOR_PUBLIC_NAME_RATE_LIMIT,
    AUTHOR_PUBLIC_NAME_RATE_WINDOW_MS,
  );
  const ipAllowed = checkAnalyticsRateLimit(
    `author-public-name-ip:${ipHash}`,
    AUTHOR_PUBLIC_NAME_IP_RATE_LIMIT,
    AUTHOR_PUBLIC_NAME_RATE_WINDOW_MS,
  );

  return !userAllowed || !ipAllowed;
}
