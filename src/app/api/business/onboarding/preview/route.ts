import { NextResponse } from "next/server";

import { onboardingPreviewAudioPath } from "@/lib/business-app/onboarding-preview-access";
import { loadOnboardingPreviewGate, loadOnboardingPreviewTrack } from "@/lib/business-app/onboarding-preview.server";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Wizard atmosphere fragment. Live trial or paid period required.
 * The body URL is a same-origin clip, not a storage object.
 */
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
  if ((await loadOnboardingPreviewGate()) !== "allow") {
    return NextResponse.json({ ok: false, reason: "no_access" }, { status: 403, headers: NO_STORE });
  }
  const track = await loadOnboardingPreviewTrack(atmosphereId);
  if (!track) return NextResponse.json({ ok: false, reason: "empty" }, { status: 200, headers: NO_STORE });
  return NextResponse.json(
    { ok: true, data: { ...track, url: onboardingPreviewAudioPath(atmosphereId) } },
    { status: 200, headers: NO_STORE },
  );
}
