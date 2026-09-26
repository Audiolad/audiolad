import "server-only";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
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

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const authenticated = await readMaxAuthenticatedPost(request, [
    "eventName",
    "promoPageId",
  ]);
  if (!authenticated.ok) return authenticated.response;

  const eventName = String(authenticated.body.eventName).trim();
  if (!isPromoPageAnalyticsEventName(eventName)) {
    return fail("invalid_event", 400);
  }

  const promoPageId = sanitizePromoPageId(
    typeof authenticated.body.promoPageId === "string"
      ? authenticated.body.promoPageId
      : null,
  );
  if (!promoPageId) {
    return fail("invalid_request", 400);
  }

  const practiceId = sanitizeAnalyticsTrackId(
    typeof authenticated.body.practiceId === "string"
      ? authenticated.body.practiceId
      : null,
  );
  const trackId = sanitizeAnalyticsTrackId(
    typeof authenticated.body.trackId === "string"
      ? authenticated.body.trackId
      : null,
  );
  const anonymousSessionId = sanitizeAnalyticsString(
    typeof authenticated.body.anonymousSessionId === "string"
      ? authenticated.body.anonymousSessionId
      : null,
    128,
  );
  const utmSource = sanitizeAnalyticsString(
    typeof authenticated.body.utmSource === "string"
      ? authenticated.body.utmSource
      : null,
    128,
  );
  const utmMedium = sanitizeAnalyticsString(
    typeof authenticated.body.utmMedium === "string"
      ? authenticated.body.utmMedium
      : null,
    128,
  );
  const utmCampaign = sanitizeAnalyticsString(
    typeof authenticated.body.utmCampaign === "string"
      ? authenticated.body.utmCampaign
      : null,
    128,
  );
  const utmContent = sanitizeAnalyticsString(
    typeof authenticated.body.utmContent === "string"
      ? authenticated.body.utmContent
      : null,
    128,
  );
  const referrer = sanitizeAnalyticsString(
    typeof authenticated.body.referrer === "string"
      ? authenticated.body.referrer
      : null,
    512,
  );
  const currentPosition = sanitizeAnalyticsPosition(
    typeof authenticated.body.currentPosition === "number"
      ? authenticated.body.currentPosition
      : null,
  );
  const duration = sanitizeAnalyticsPosition(
    typeof authenticated.body.duration === "number"
      ? authenticated.body.duration
      : null,
  );
  const payload =
    authenticated.body.payload &&
    typeof authenticated.body.payload === "object" &&
    !Array.isArray(authenticated.body.payload)
      ? sanitizePromoPageAnalyticsPayload(
          authenticated.body.payload as Record<string, unknown>,
        )
      : {};

  try {
    const service = createServiceRoleClient();
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
