import { NextResponse } from "next/server";

import { loadOnboardingPreviewTrack } from "@/lib/business-app/onboarding-preview.server";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** One catalog preview for the wizard atmosphere step. Signed-in only. No heartbeat. */
export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 1024) return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 413, headers: NO_STORE });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const atmosphereId = body && typeof body === "object" ? (body as { atmosphereId?: unknown }).atmosphereId : null;
  if (typeof atmosphereId !== "string" || atmosphereId.length > 40) {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "no_access" }, { status: 403, headers: NO_STORE });
  const track = await loadOnboardingPreviewTrack(atmosphereId);
  if (!track) return NextResponse.json({ ok: false, reason: "empty" }, { status: 200, headers: NO_STORE });
  return NextResponse.json({ ok: true, data: track }, { status: 200, headers: NO_STORE });
}
