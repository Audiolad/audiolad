import { NextResponse } from "next/server";

import {
  isAllowedAnalyticsEventName,
  isPwaAnalyticsEventName,
  sanitizePwaAnalyticsPayload,
} from "@/lib/pwa/analytics-events";
import {
  sanitizeAnalyticsPosition,
  sanitizeAnalyticsString,
  sanitizeAnalyticsTrackId,
} from "@/lib/promo/analytics-events";
import {
  sanitizePromoPageAnalyticsPayload,
  sanitizePromoPageId,
} from "@/lib/promo-pages/analytics-events";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type AnalyticsEventBody = {
  event_name?: unknown;
  practice_id?: unknown;
  track_id?: unknown;
  promo_page_id?: unknown;
  anonymous_session_id?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  referrer?: unknown;
  current_position?: unknown;
  duration?: unknown;
  payload?: unknown;
};

function parseAnalyticsEventBody(body: unknown): AnalyticsEventBody | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  return body as AnalyticsEventBody;
}

function sanitizeJsonPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const payload = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(payload)) {
    if (typeof raw === "string") {
      next[key] = raw.slice(0, 128);
    }
  }

  return next;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseAnalyticsEventBody(body);

  if (!parsed) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const eventName =
    typeof parsed.event_name === "string" ? parsed.event_name.trim() : "";

  if (!isAllowedAnalyticsEventName(eventName)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  const supabase = await createClientFromRequest(request);

  const practiceId = sanitizeAnalyticsTrackId(
    typeof parsed.practice_id === "string" ? parsed.practice_id : null,
  );
  const trackId = sanitizeAnalyticsTrackId(
    typeof parsed.track_id === "string" ? parsed.track_id : null,
  );
  const promoPageId = sanitizePromoPageId(
    typeof parsed.promo_page_id === "string" ? parsed.promo_page_id : null,
  );

  let rpcPayload = sanitizeJsonPayload(parsed.payload);

  if (eventName.startsWith("promo_page_")) {
    rpcPayload = sanitizePromoPageAnalyticsPayload(
      rpcPayload as Record<string, unknown>,
    );
  }

  if (isPwaAnalyticsEventName(eventName)) {
    const pwaPayload = sanitizePwaAnalyticsPayload({
      event_name: eventName,
      anonymous_session_id:
        typeof parsed.anonymous_session_id === "string"
          ? parsed.anonymous_session_id
          : null,
      platform:
        typeof rpcPayload.platform === "string" ? rpcPayload.platform : null,
      source: typeof rpcPayload.source === "string" ? rpcPayload.source : null,
    });

    if (!pwaPayload) {
      return NextResponse.json({ error: "invalid_event" }, { status: 400 });
    }

    rpcPayload = {
      platform: pwaPayload.platform,
      source: pwaPayload.source,
    };
  }

  const { data, error } = await supabase.rpc("insert_analytics_event", {
    p_event_name: eventName,
    p_practice_id: practiceId,
    p_track_id: trackId,
    p_anonymous_session_id: sanitizeAnalyticsString(
      typeof parsed.anonymous_session_id === "string"
        ? parsed.anonymous_session_id
        : null,
      128,
    ),
    p_utm_source: sanitizeAnalyticsString(
      typeof parsed.utm_source === "string" ? parsed.utm_source : null,
      128,
    ),
    p_utm_medium: sanitizeAnalyticsString(
      typeof parsed.utm_medium === "string" ? parsed.utm_medium : null,
      128,
    ),
    p_utm_campaign: sanitizeAnalyticsString(
      typeof parsed.utm_campaign === "string" ? parsed.utm_campaign : null,
      128,
    ),
    p_utm_content: sanitizeAnalyticsString(
      typeof parsed.utm_content === "string" ? parsed.utm_content : null,
      128,
    ),
    p_referrer: sanitizeAnalyticsString(
      typeof parsed.referrer === "string" ? parsed.referrer : null,
      512,
    ),
    p_current_position: sanitizeAnalyticsPosition(
      typeof parsed.current_position === "number"
        ? parsed.current_position
        : null,
    ),
    p_duration: sanitizeAnalyticsPosition(
      typeof parsed.duration === "number" ? parsed.duration : null,
    ),
    p_payload: rpcPayload,
    p_promo_page_id: promoPageId,
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("event_name_not_allowed") ||
      error.message.toLowerCase().includes("event_name_required")
    ) {
      return NextResponse.json({ error: "invalid_event" }, { status: 400 });
    }

    console.error("analytics_event_rpc_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event_id: data }, { status: 201 });
}
