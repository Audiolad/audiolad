import { NextResponse } from "next/server";

import { sanitizeAnalyticsString, sanitizeAnalyticsTrackId } from "@/lib/promo/analytics-events";
import {
  guardAnalyticsHeavyRpc,
  invokeAnalyticsRpc,
} from "@/lib/analytics/rpc-protection";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type LinkBody = {
  session_id?: unknown;
  anonymous_id?: unknown;
};

function hasAuthHint(request: Request): boolean {
  if (request.headers.get("authorization")?.trim().startsWith("Bearer ")) {
    return true;
  }

  return hasSupabaseAuthCookie(
    request.headers.get("cookie") ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

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

  if (!hasAuthHint(request)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const guard = guardAnalyticsHeavyRpc({
    route: "session_link",
    request,
    sessionId,
  });

  if (guard.action === "rate_limited") {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (guard.action === "circuit_open") {
    return NextResponse.json({ error: "overloaded" }, { status: 503 });
  }

  if (guard.action === "deduped") {
    return NextResponse.json({ linked: true, deduped: true }, { status: 200 });
  }

  try {
    const supabase = await createClientFromRequest(request);
    const result = await invokeAnalyticsRpc(
      supabase.rpc("link_analytics_session_user", {
        p_session_id: sessionId,
        p_anonymous_id: anonymousId,
      }),
    );

    if (result.kind === "overload" || result.kind === "timeout") {
      guard.release(result.kind);
      return NextResponse.json({ error: "overloaded" }, { status: 503 });
    }

    if (result.error) {
      guard.release("error");
      console.error("analytics_session_link_error", result.error.message);
      // Fail-soft after the RPC returns. Do not 500 — clients must not retry
      // 55P03 / PGRST003 in this page lifecycle.
      return new NextResponse(null, { status: 204 });
    }

    guard.release("ok");
    return NextResponse.json({ linked: Boolean(result.data) }, { status: 200 });
  } catch (error) {
    guard.release("error");
    console.error(
      "analytics_session_link_error",
      error instanceof Error ? error.message : "unknown",
    );
    return new NextResponse(null, { status: 204 });
  }
}
