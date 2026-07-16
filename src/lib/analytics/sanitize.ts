import {
  sanitizeAnalyticsString,
  sanitizeAnalyticsTrackId,
} from "@/lib/promo/analytics-events";

import { isPlatformAnalyticsEventName } from "@/lib/analytics/constants";

const MAX_PROPERTIES = 12;

export function sanitizeAnalyticsPath(
  value: string | null | undefined,
): string | null {
  return sanitizeAnalyticsString(value, 512);
}

export function sanitizeAnalyticsProperties(
  value: unknown,
): Record<string, string | number | boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const next: Record<string, string | number | boolean> = {};
  let count = 0;

  for (const [key, raw] of Object.entries(input)) {
    if (count >= MAX_PROPERTIES) {
      break;
    }

    const normalizedKey = sanitizeAnalyticsString(key, 64);

    if (!normalizedKey) {
      continue;
    }

    if (typeof raw === "string") {
      const sanitized = sanitizeAnalyticsString(raw, 128);
      if (sanitized) {
        next[normalizedKey] = sanitized;
        count += 1;
      }
      continue;
    }

    if (typeof raw === "number" && Number.isFinite(raw)) {
      next[normalizedKey] = Math.floor(raw);
      count += 1;
      continue;
    }

    if (typeof raw === "boolean") {
      next[normalizedKey] = raw;
      count += 1;
    }
  }

  return next;
}

export function parsePlatformTrackBody(body: unknown): {
  session_id: string;
  anonymous_id: string;
  event_name: string;
  path: string | null;
  practice_id: string | null;
  audio_item_id: string | null;
  properties: Record<string, string | number | boolean>;
} | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const sessionId = sanitizeAnalyticsTrackId(
    typeof record.session_id === "string" ? record.session_id : null,
  );
  const anonymousId = sanitizeAnalyticsString(
    typeof record.anonymous_id === "string" ? record.anonymous_id : null,
    128,
  );
  const eventName =
    typeof record.event_name === "string" ? record.event_name.trim() : "";

  if (!sessionId || !anonymousId || !isPlatformAnalyticsEventName(eventName)) {
    return null;
  }

  return {
    session_id: sessionId,
    anonymous_id: anonymousId,
    event_name: eventName,
    path: sanitizeAnalyticsPath(
      typeof record.path === "string" ? record.path : null,
    ),
    practice_id: sanitizeAnalyticsTrackId(
      typeof record.practice_id === "string" ? record.practice_id : null,
    ),
    audio_item_id: sanitizeAnalyticsTrackId(
      typeof record.audio_item_id === "string" ? record.audio_item_id : null,
    ),
    properties: sanitizeAnalyticsProperties(record.properties),
  };
}

export function parseSessionBody(body: unknown): {
  session_id: string | null;
  anonymous_id: string;
  landing_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer_domain: string | null;
  device_type: string | null;
} | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const anonymousId = sanitizeAnalyticsString(
    typeof record.anonymous_id === "string" ? record.anonymous_id : null,
    128,
  );

  if (!anonymousId) {
    return null;
  }

  const deviceType = sanitizeAnalyticsString(
    typeof record.device_type === "string" ? record.device_type : null,
    16,
  );

  return {
    session_id: sanitizeAnalyticsTrackId(
      typeof record.session_id === "string" ? record.session_id : null,
    ),
    anonymous_id: anonymousId,
    landing_path: sanitizeAnalyticsPath(
      typeof record.landing_path === "string" ? record.landing_path : null,
    ),
    utm_source: sanitizeAnalyticsString(
      typeof record.utm_source === "string" ? record.utm_source : null,
      128,
    ),
    utm_medium: sanitizeAnalyticsString(
      typeof record.utm_medium === "string" ? record.utm_medium : null,
      128,
    ),
    utm_campaign: sanitizeAnalyticsString(
      typeof record.utm_campaign === "string" ? record.utm_campaign : null,
      128,
    ),
    utm_content: sanitizeAnalyticsString(
      typeof record.utm_content === "string" ? record.utm_content : null,
      128,
    ),
    referrer_domain: sanitizeAnalyticsString(
      typeof record.referrer_domain === "string" ? record.referrer_domain : null,
      128,
    ),
    device_type:
      deviceType === "mobile" || deviceType === "tablet" || deviceType === "desktop"
        ? deviceType
        : null,
  };
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkAnalyticsRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  return true;
}
