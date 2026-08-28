import { NextResponse } from "next/server";

import {
  classifyAnalyticsRpcError,
  invokeAnalyticsRpc,
  isAnalyticsCircuitOpen,
} from "@/lib/analytics/rpc-protection";
import {
  checkAnalyticsRateLimit,
  parsePlatformTrackBody,
} from "@/lib/analytics/sanitize";
import { getTrustedClientIp } from "@/lib/http/trusted-client-ip";
import { createClientFromRequest } from "@/lib/supabase/request-client";

function getClientKey(request: Request, anonymousId: string): string {
  return `${getTrustedClientIp(request)}:${anonymousId}:track`;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = parsePlatformTrackBody(body);

  if (!parsed) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (
    !checkAnalyticsRateLimit(getClientKey(request, parsed.anonymous_id), 120, 60_000)
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (isAnalyticsCircuitOpen()) {
    return NextResponse.json({ error: "overloaded" }, { status: 503 });
  }

  const supabase = await createClientFromRequest(request);

  const { data, error, kind } = await invokeAnalyticsRpc(
    supabase.rpc("insert_platform_analytics_event", {
      p_session_id: parsed.session_id,
      p_anonymous_id: parsed.anonymous_id,
      p_event_name: parsed.event_name,
      p_path: parsed.path,
      p_practice_id: parsed.practice_id,
      p_audio_item_id: parsed.audio_item_id,
      p_properties: parsed.properties,
      p_client_event_id: parsed.client_event_id,
      p_user_agent: request.headers.get("user-agent"),
      p_client_version: parsed.client_version,
      p_author_id: parsed.author_id,
    }),
  );

  if (error) {
    const message = (error.message ?? "").toLowerCase();
    if (
      message.includes("event_name_not_allowed") ||
      message.includes("session_mismatch") ||
      message.includes("session_required") ||
      message.includes("author_required") ||
      message.includes("author_not_found")
    ) {
      return NextResponse.json({ error: "invalid_event" }, { status: 400 });
    }

    const classified = classifyAnalyticsRpcError(error);
    console.error("platform_analytics_track_error", error.message);

    if (kind === "overload" || kind === "timeout" || classified.kind === "overload") {
      return NextResponse.json({ error: "overloaded" }, { status: 503 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event_id: data }, { status: 201 });
}
