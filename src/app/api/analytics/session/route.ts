import { NextResponse } from "next/server";

import { isPrefetchOrPrerenderRequest } from "@/lib/analytics/page-presence";
import { parseSessionBody, checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { createClientFromRequest } from "@/lib/supabase/request-client";

function getClientKey(request: Request, anonymousId: string): string {
  return `${getTrustedClientIp(request)}:${anonymousId}`;
}

export async function POST(request: Request) {
  // t1508u: prefetch / prerender is not a visit. No session row, no visitor.
  if (isPrefetchOrPrerenderRequest(request.headers)) {
    return NextResponse.json({ session_id: null, skipped: "prefetch" }, { status: 200 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parseSessionBody(body);

  if (!parsed) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (
    !checkAnalyticsRateLimit(getClientKey(request, parsed.anonymous_id), 30, 60_000)
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createClientFromRequest(request);

  const { data, error } = await supabase.rpc("upsert_analytics_session", {
    p_session_id: parsed.session_id,
    p_anonymous_id: parsed.anonymous_id,
    p_landing_path: parsed.landing_path,
    p_utm_source: parsed.utm_source,
    p_utm_medium: parsed.utm_medium,
    p_utm_campaign: parsed.utm_campaign,
    p_utm_content: parsed.utm_content,
    p_utm_term: parsed.utm_term,
    p_referrer_domain: parsed.referrer_domain,
    p_device_type: parsed.device_type ?? "desktop",
    p_user_agent: request.headers.get("user-agent"),
    p_client_version: parsed.client_version,
  });

  if (error) {
    console.error("analytics_session_rpc_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ session_id: data }, { status: 200 });
}
