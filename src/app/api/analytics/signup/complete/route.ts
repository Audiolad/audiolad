import { NextResponse } from "next/server";

import { sanitizeAnalyticsString, sanitizeAnalyticsTrackId } from "@/lib/promo/analytics-events";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type SignupCompleteBody = {
  session_id?: unknown;
  anonymous_id?: unknown;
};

export async function POST(request: Request) {
  let body: SignupCompleteBody;

  try {
    body = (await request.json()) as SignupCompleteBody;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("record_platform_signup_completed", {
    p_session_id: sessionId,
    p_anonymous_id: anonymousId,
  });

  if (error) {
    console.error("analytics_signup_complete_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const result = (data ?? {}) as { recorded?: boolean; reason?: string };

  return NextResponse.json(
    {
      recorded: Boolean(result.recorded),
      reason: typeof result.reason === "string" ? result.reason : null,
    },
    { status: 200 },
  );
}
