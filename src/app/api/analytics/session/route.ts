import { NextResponse } from "next/server";

import { parseSessionBody, checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { createClientFromRequest } from "@/lib/supabase/request-client";

function getClientKey(request: Request, anonymousId: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded ?? "unknown"}:${anonymousId}`;
}

export async function POST(request: Request) {
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
    p_referrer_domain: parsed.referrer_domain,
    p_device_type: parsed.device_type ?? "desktop",
  });

  if (error) {
    console.error("analytics_session_rpc_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ session_id: data }, { status: 200 });
}
