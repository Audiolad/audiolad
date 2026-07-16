import { NextResponse } from "next/server";

import { sanitizeAnalyticsString, sanitizeAnalyticsTrackId } from "@/lib/promo/analytics-events";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type LinkBody = {
  session_id?: unknown;
  anonymous_id?: unknown;
};

export async function POST(request: Request) {
  let body: LinkBody;

  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const sessionId = sanitizeAnalyticsTrackId(
    typeof body.session_id === "string" ? body.session_id : null,
  );
  const anonymousId = sanitizeAnalyticsString(
    typeof body.anonymous_id === "string" ? body.anonymous_id : null,
    128,
  );

  if (!sessionId || !anonymousId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClientFromRequest(request);

  const { data, error } = await supabase.rpc("link_analytics_session_user", {
    p_session_id: sessionId,
    p_anonymous_id: anonymousId,
  });

  if (error) {
    console.error("analytics_session_link_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ linked: Boolean(data) }, { status: 200 });
}
