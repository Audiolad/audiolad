import { NextResponse } from "next/server";

import {
  isGuestCoffeeClosedTrackStillLive,
  isGuestCoffeeTrackStillAdmitted,
  loadGuestCoffeeShelf,
  signGuestCoffeeClosedAudio,
} from "@/lib/business-app/guest-coffee/load.server";
import { handleGuestCoffeeTrackUrl } from "@/lib/business-app/guest-coffee/routes";
import { issueGuestCoffeeLease, peekGuestCoffeeUsage } from "@/lib/business-app/guest-coffee/usage.server";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";

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
    isStillLive: isGuestCoffeeClosedTrackStillLive,
    isStillAdmitted: isGuestCoffeeTrackStillAdmitted,
    peekUsage: peekGuestCoffeeUsage,
    issueLease: (trackSeconds) => issueGuestCoffeeLease(request, trackSeconds),
    // t1670u: closed catalogue – the hall player's signer, only for tracks of the guest preview.
    sign: ({ audioId }) => signGuestCoffeeClosedAudio(audioId),
  });
  // Business outcomes are 200 with { ok:false, reason } so the player keeps its skip/deny logic.
  const status = !result.ok && result.reason === "invalid_request" ? 400 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
