import { createHash } from "node:crypto";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";

import { redactTokenFromPath } from "./delivery";

const GUEST_METADATA_LIMIT = 60;
const GUEST_AUDIO_LIMIT = 30;
const GUEST_PDF_LIMIT = 30;
const WINDOW_MS = 60_000;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ?? request.headers.get("x-real-ip") ?? "unknown";
}

function buildGuestRateLimitKey(request: Request, route: string): string {
  const ip = getClientIp(request);
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  return `pm-guest:${route}:${ipHash}`;
}

export function enforceGuestMetadataRateLimit(request: Request): Response | null {
  const key = buildGuestRateLimitKey(request, "metadata");

  if (checkAnalyticsRateLimit(key, GUEST_METADATA_LIMIT, WINDOW_MS)) {
    return null;
  }

  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "60",
      "Cache-Control": "private, no-store",
    },
  });
}

export function enforceGuestAudioRateLimit(request: Request): Response | null {
  const key = buildGuestRateLimitKey(request, "audio");

  if (checkAnalyticsRateLimit(key, GUEST_AUDIO_LIMIT, WINDOW_MS)) {
    return null;
  }

  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "60",
      "Cache-Control": "private, no-store",
    },
  });
}

export function enforceGuestPdfRateLimit(request: Request): Response | null {
  const key = buildGuestRateLimitKey(request, "pdf");

  if (checkAnalyticsRateLimit(key, GUEST_PDF_LIMIT, WINDOW_MS)) {
    return null;
  }

  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "60",
      "Cache-Control": "private, no-store",
    },
  });
}

export function logGuestRouteAccess(request: Request) {
  const pathname = new URL(request.url).pathname;
  console.info("personal_material_guest_route", redactTokenFromPath(pathname));
}
