import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { recordAccessActivity } from "@/lib/access-grants/apply";
import { createSupabaseAccessGrantStore } from "@/lib/access-grants/supabase-store";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { BUSINESS_POINT_COOKIE, isPointToken } from "@/lib/business-app/point-session";
import { pointMusicAllowed, POINT_MUSIC_FORBIDDEN } from "@/lib/business-app/point-sound";
import { pointPlaybackAllowed } from "@/lib/business-app/point-playback-guard";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspaceActor, loadWorkspacePage } from "@/lib/business-workspace/load.server";
import { clampWorkspacePlayback, type WorkspacePlayback } from "@/lib/business-workspace/playback";
import { handleWorkspaceState } from "@/lib/business-workspace/routes";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

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
  let volumeOnlyPlayback: WorkspacePlayback | null = null;
  const result = await handleWorkspaceState(body, {
    userId: async () => (actor.ok ? actor.userId : null),
    playerOpen: async () => actor.ok && actor.playerOpen,
    playbackAllowed: async (input) => {
      if (!actor.ok) return false;
      const token = (await cookies()).get(BUSINESS_POINT_COOKIE)?.value;
      if (!isPointToken(token)) return true;
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("get_business_point_sound_settings", { p_token: token });
      // A cookie is a point session only after validation; RPC failures fail closed.
      if (error) return false;
      if (!data || (data as { ok?: boolean }).ok !== true) return true;
      const pointCanEdit = pointMusicAllowed(data);
      if (pointCanEdit) return true;
      const stored = await createSupabaseAccessGrantStore().readPlayback(actor.userId, actor.space.id);
      // A volume-only request must never smuggle in a track/position change.
      if (input.volumeOnly && input.cause === "progress" && stored) volumeOnlyPlayback = stored;
      return pointPlaybackAllowed({ isPoint: true, pointCanEdit, stored, next: volumeOnlyPlayback ?? input, cause: input.cause });
    },
    savePlayback: async (input) => {
      if (!actor.ok) return;
      const store = createSupabaseAccessGrantStore();
      const clamped = clampWorkspacePlayback({
        ...input,
        ...(volumeOnlyPlayback ? { index: volumeOnlyPlayback.index, positionSec: volumeOnlyPlayback.positionSec } : {}),
        // Keep the position's clock anchor when only volume is written.
        updatedAt: volumeOnlyPlayback?.updatedAt ?? new Date().toISOString(),
      }, 10_000);
      await store.writePlayback({
        userId: actor.userId,
        spaceId: actor.space.id,
        index: clamped.index,
        positionSec: clamped.positionSec,
        volume: clamped.volume,
        updatedAt: clamped.updatedAt,
      });
    },
    recordPlay: async () => {
      if (!actor.ok) return;
      await recordAccessActivity(createSupabaseAccessGrantStore(), {
        userId: actor.userId,
        email: actor.email,
        action: "play",
      });
    },
    recordOfferClick: async () => {
      if (!actor.ok) return;
      await recordAccessActivity(createSupabaseAccessGrantStore(), {
        userId: actor.userId,
        email: actor.email,
        action: "offer_click",
      });
    },
  });
  if (!result.ok && !actor.ok && actor.reason === "unavailable" && result.reason === "no_access") {
    return NextResponse.json({ ok: false, reason: "guest_unavailable" }, { status: 200, headers: NO_STORE });
  }
  if (!result.ok && result.reason === "forbidden") {
    return NextResponse.json({ ...result, error: POINT_MUSIC_FORBIDDEN }, { status: 403, headers: NO_STORE });
  }
  const status = !result.ok && result.reason === "invalid_request" ? 400 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
