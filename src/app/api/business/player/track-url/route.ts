import { NextResponse } from "next/server";

import { loadSpaPilotContext, signSpaTrack } from "@/lib/business-app/spa-pilot";
import { handleSpaTrackUrl, isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Stable (build-independent) stream URL signing for an open /spa tab across deploys. */
export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const result = await handleSpaTrackUrl(body, {
    loadContext: loadSpaPilotContext,
    sign: (ctx, id) => signSpaTrack(ctx, id, "stream"),
  });
  // Business outcomes are 200 with { ok:false, reason } so the player keeps its skip/deny logic.
  return NextResponse.json(result, { status: result.ok || result.reason !== "invalid_request" ? 200 : 400, headers: NO_STORE });
}
