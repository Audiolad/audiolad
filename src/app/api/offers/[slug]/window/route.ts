import { NextResponse } from "next/server";

import {
  buildOfferWindowCookieHeader,
  buildOfferWindowCookieName,
  issueOrReuseOfferWindow,
  offerWindowExpiresAtIso,
  parseCookieHeaderValue,
} from "@/lib/quick-offers/offer-window-token";
import { loadPublicQuickOfferCached } from "@/lib/quick-offers/public-page";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function remainingSeconds(expiresAtIso: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAtIso) - nowMs) / 1000));
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const normalized = slug.trim();

  if (!normalized) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createClient();
  const loaded = await loadPublicQuickOfferCached(supabase, normalized);

  if (!loaded.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let issued;

  try {
    issued = issueOrReuseOfferWindow({
      offerId: loaded.offer.id,
      durationSeconds: loaded.offer.timer_duration_seconds,
      existingToken: parseCookieHeaderValue(
        request.headers.get("cookie"),
        buildOfferWindowCookieName(loaded.offer.id),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "window_error";
    console.error("quick_offer_window_issue_error", message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const expiresAt = offerWindowExpiresAtIso(issued.payload);
  const nowMs = Date.now();
  const remaining = remainingSeconds(expiresAt, nowMs);

  const response = NextResponse.json(
    {
      expires_at: expiresAt,
      remaining_seconds: remaining,
      is_expired: remaining <= 0,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  response.headers.append(
    "Set-Cookie",
    buildOfferWindowCookieHeader({
      offerId: loaded.offer.id,
      token: issued.token,
    }),
  );

  return response;
}
