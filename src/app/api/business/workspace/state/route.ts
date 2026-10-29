import { NextResponse } from "next/server";

import { recordAccessActivity } from "@/lib/access-grants/apply";
import { createSupabaseAccessGrantStore } from "@/lib/access-grants/supabase-store";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { loadWorkspaceActor, loadWorkspacePage } from "@/lib/business-workspace/load.server";
import { clampWorkspacePlayback } from "@/lib/business-workspace/playback";
import { handleWorkspaceState } from "@/lib/business-workspace/routes";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const POINT_DEVICE_STATE_ACTOR = "point-device";

/** Refresh the authenticated access model after its local deadline. */
export async function GET(request: Request) {
  const model = await loadWorkspacePage(new URL(request.url).searchParams.get("space"));
  return NextResponse.json({ ok: true, model }, { headers: NO_STORE });
}

/** Persist playback and record trial analytics. Does not open a closed player. */
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
  const actor = await loadWorkspaceActor(new URL(request.url).searchParams.get("space"));
  // The paired venue device has no account: its position is not saved under whoever is
  // signed in on the browser and it records no trial analytics.
  const account = actor.ok && !actor.device ? actor : null;
  const result = await handleWorkspaceState(body, {
    userId: async () => (actor.ok ? (actor.device ? POINT_DEVICE_STATE_ACTOR : actor.userId) : null),
    playerOpen: async () => actor.ok && actor.playerOpen,
    savePlayback: async (input) => {
      if (!account) return;
      const store = createSupabaseAccessGrantStore();
      const clamped = clampWorkspacePlayback({ ...input, updatedAt: new Date().toISOString() }, 10_000);
      await store.writePlayback({
        userId: account.userId,
        spaceId: account.space.id,
        index: clamped.index,
        positionSec: clamped.positionSec,
        volume: clamped.volume,
        updatedAt: clamped.updatedAt,
      });
    },
    recordPlay: async () => {
      if (!account) return;
      await recordAccessActivity(createSupabaseAccessGrantStore(), {
        userId: account.userId,
        email: account.email,
        action: "play",
      });
    },
    recordOfferClick: async () => {
      if (!account) return;
      await recordAccessActivity(createSupabaseAccessGrantStore(), {
        userId: account.userId,
        email: account.email,
        action: "offer_click",
      });
    },
  });
  if (!result.ok && !actor.ok && actor.reason === "unavailable" && result.reason === "no_access") {
    return NextResponse.json({ ok: false, reason: "guest_unavailable" }, { status: 200, headers: NO_STORE });
  }
  const status = !result.ok && result.reason === "invalid_request" ? 400 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
