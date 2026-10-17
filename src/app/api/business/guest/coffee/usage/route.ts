import { NextResponse } from "next/server";

import { handleGuestCoffeeUsage } from "@/lib/business-app/guest-coffee/routes";
import { reportGuestCoffeePlayback } from "@/lib/business-app/guest-coffee/usage.server";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** a8240527: credit seconds of ACTUAL playback to the guest's server-side meter. */
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
  const result = await handleGuestCoffeeUsage(body, (seconds) => reportGuestCoffeePlayback(request, seconds));
  const status = !result.ok && result.reason === "invalid_request" ? 400 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
