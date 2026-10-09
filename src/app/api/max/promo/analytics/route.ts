import "server-only";

import { readMaxVerifiedPost } from "@/lib/max/authenticated-post";
import {
  sanitizeAnalyticsPosition,
  sanitizeAnalyticsString,
  sanitizeAnalyticsTrackId,
} from "@/lib/promo/analytics-events";
import {
  isPromoPageAnalyticsEventName,
  sanitizePromoPageAnalyticsPayload,
  sanitizePromoPageId,
} from "@/lib/promo-pages/analytics-events";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";

type CreateClient = typeof createServiceRoleClient;
let createClientImpl: CreateClient | null = null;

export function setMaxPromoAnalyticsClientForTests(impl: CreateClient | null) {
  createClientImpl = impl;
}

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const verified = await readMaxVerifiedPost(request, [
    "eventName",
    "promoPageId",
  ]);
  if (!verified.ok) return verified.response;

  const eventName = String(verified.body.eventName).trim();
  if (!isPromoPageAnalyticsEventName(eventName)) {
    return fail("invalid_event", 400);
  }

  const promoPageId = sanitizePromoPageId(
    typeof verified.body.promoPageId === "string"
      ? verified.body.promoPageId
      : null,
  );
  if (!promoPageId) {
    return fail("invalid_request", 400);
  }

  const practiceId = sanitizeAnalyticsTrackId(
    typeof verified.body.practiceId === "string"
      ? verified.body.practiceId
      : null,
  );
  const trackId = sanitizeAnalyticsTrackId(
    typeof verified.body.trackId === "string"
      ? verified.body.trackId
      : null,
  );
  const anonymousSessionId = sanitizeAnalyticsString(
    typeof verified.body.anonymousSessionId === "string"
      ? verified.body.anonymousSessionId
      : null,
    128,
  );
  const utmSource = sanitizeAnalyticsString(
    typeof verified.body.utmSource === "string"
      ? verified.body.utmSource
      : null,
    128,
  );
  const utmMedium = sanitizeAnalyticsString(
    typeof verified.body.utmMedium === "string"
      ? verified.body.utmMedium
      : null,
    128,
  );
  const utmCampaign = sanitizeAnalyticsString(
    typeof verified.body.utmCampaign === "string"
      ? verified.body.utmCampaign
      : null,
    128,
  );
  const utmContent = sanitizeAnalyticsString(
    typeof verified.body.utmContent === "string"
      ? verified.body.utmContent
      : null,
    128,
  );
  const referrer = sanitizeAnalyticsString(
    typeof verified.body.referrer === "string"
      ? verified.body.referrer
      : null,
    512,
  );
  const currentPosition = sanitizeAnalyticsPosition(
    typeof verified.body.currentPosition === "number"
      ? verified.body.currentPosition
      : null,
  );
  const duration = sanitizeAnalyticsPosition(
    typeof verified.body.duration === "number"
      ? verified.body.duration
      : null,
  );
  const payload =
    verified.body.payload &&
    typeof verified.body.payload === "object" &&
    !Array.isArray(verified.body.payload)
      ? sanitizePromoPageAnalyticsPayload(
          verified.body.payload as Record<string, unknown>,
        )
      : {};

  try {
    const service = (createClientImpl ?? createServiceRoleClient)();
    const { data, error } = await service.rpc("insert_analytics_event", {
      p_event_name: eventName,
      p_practice_id: practiceId,
      p_track_id: trackId,
      p_anonymous_session_id: anonymousSessionId,
      p_utm_source: utmSource,
      p_utm_medium: utmMedium,
      p_utm_campaign: utmCampaign,
      p_utm_content: utmContent,
      p_referrer: referrer,
      p_current_position: currentPosition,
      p_duration: duration,
      p_payload: payload,
      p_promo_page_id: promoPageId,
    });

    if (error) {
      return fail("storage_unavailable", 503);
    }

    return Response.json(
      { ok: true, eventId: data },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return fail("storage_unavailable", 503);
  }
}
