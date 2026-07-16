import { NextResponse } from "next/server";

import {
  checkAnalyticsRateLimit,
  parsePlatformTrackBody,
} from "@/lib/analytics/sanitize";
import { createClientFromRequest } from "@/lib/supabase/request-client";

function getClientKey(request: Request, anonymousId: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded ?? "unknown"}:${anonymousId}:track`;
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

  const supabase = await createClientFromRequest(request);

  const { data, error } = await supabase.rpc("insert_platform_analytics_event", {
    p_session_id: parsed.session_id,
    p_anonymous_id: parsed.anonymous_id,
    p_event_name: parsed.event_name,
    p_path: parsed.path,
    p_practice_id: parsed.practice_id,
    p_audio_item_id: parsed.audio_item_id,
    p_properties: parsed.properties,
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("event_name_not_allowed") ||
      error.message.toLowerCase().includes("session_mismatch") ||
      error.message.toLowerCase().includes("session_required")
    ) {
      return NextResponse.json({ error: "invalid_event" }, { status: 400 });
    }

    console.error("platform_analytics_track_error", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event_id: data }, { status: 201 });
}
