import { NextResponse } from "next/server";

import { isSameOriginCabinetRequest } from "@/lib/business-app/onboarding-preview-access";
import { loadOnboardingPreviewClip, loadOnboardingPreviewGate } from "@/lib/business-app/onboarding-preview.server";
import { businessOnboardingAtmosphereSound } from "@/lib/business-app/onboarding-wizard";
import { previewClipResponseHeaders, sliceBytesForRange } from "@/lib/listen/preview-clip-http";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** MPEG fragment for one wizard atmosphere. Never a full-object storage URL. */
export async function GET(request: Request) {
  if (!isSameOriginCabinetRequest(request.headers)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  const atmosphereId = new URL(request.url).searchParams.get("atmosphereId");
  if (!atmosphereId || atmosphereId.length > 40 || !businessOnboardingAtmosphereSound(atmosphereId)) {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  if ((await loadOnboardingPreviewGate()) !== "allow") {
    return NextResponse.json({ ok: false, reason: "no_access" }, { status: 403, headers: NO_STORE });
  }
  const clip = await loadOnboardingPreviewClip(atmosphereId);
  if (!clip) return NextResponse.json({ ok: false, reason: "empty" }, { status: 404, headers: NO_STORE });
  const ranged = sliceBytesForRange(clip, request.headers.get("range"));
  return new NextResponse(Buffer.from(ranged.body), {
    status: ranged.status,
    headers: previewClipResponseHeaders({
      contentLength: ranged.body.byteLength,
      contentRange: ranged.contentRange,
    }),
  });
}
