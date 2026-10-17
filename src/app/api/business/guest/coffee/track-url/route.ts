import { NextResponse } from "next/server";

import { loadGuestCoffeeShelf } from "@/lib/business-app/guest-coffee/load.server";
import { handleGuestCoffeeTrackUrl } from "@/lib/business-app/guest-coffee/routes";
import { applyGuestCoffeeUsage } from "@/lib/business-app/guest-coffee/usage.server";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { signEntitledListenAudio } from "@/lib/listen/sign-entitled-audio";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** a8240527: short-lived stream URL for the guest coffee cabinet (server-side 30-minute limit). */
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
  const result = await handleGuestCoffeeTrackUrl(body, {
    loadShelf: loadGuestCoffeeShelf,
    readUsage: () => applyGuestCoffeeUsage(request, 0),
    sign: async ({ authorSlug, productSlug, audioId }) => {

      const signed = await signEntitledListenAudio({ userId: null, authorSlug, productSlug, audioId });
      return signed.ok ? { ok: true, url: signed.url } : { ok: false, reason: signed.reason };
    },
  });
  // Business outcomes are 200 with { ok:false, reason } so the player keeps its skip/deny logic.
  const status = !result.ok && result.reason === "invalid_request" ? 400 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
