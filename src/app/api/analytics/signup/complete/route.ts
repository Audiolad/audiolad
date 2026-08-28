import { NextResponse } from "next/server";

import { sanitizeAnalyticsString, sanitizeAnalyticsTrackId } from "@/lib/promo/analytics-events";
import {
  guardAnalyticsHeavyRpc,
  invokeAnalyticsRpc,
} from "@/lib/analytics/rpc-protection";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-cookie";
import { createClientFromRequest } from "@/lib/supabase/request-client";

type SignupCompleteBody = {
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

  if (!hasAuthHint(request)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const guard = guardAnalyticsHeavyRpc({
    route: "signup_complete",
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
    return NextResponse.json(
      { recorded: false, reason: "deduped" },
      { status: 200 },
    );
  }

  try {
    const supabase = await createClientFromRequest(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      guard.release("error");
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const result = await invokeAnalyticsRpc(
      supabase.rpc("record_platform_signup_completed", {
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
      console.error("analytics_signup_complete_error", result.error.message);
      return NextResponse.json(
        { recorded: false, reason: "degraded" },
        { status: 200 },
      );
    }

    guard.release("ok");
    const payload = (result.data ?? {}) as { recorded?: boolean; reason?: string };

    return NextResponse.json(
      {
        recorded: Boolean(payload.recorded),
        reason: typeof payload.reason === "string" ? payload.reason : null,
      },
      { status: 200 },
    );
  } catch (error) {
    guard.release("error");
    console.error(
      "analytics_signup_complete_error",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { recorded: false, reason: "degraded" },
      { status: 200 },
    );
  }
}
