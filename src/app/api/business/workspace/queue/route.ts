import { NextResponse } from "next/server";

import { handleCafeQueue } from "@/lib/business-app/cafe-queue/handle";
import { loadCafeQueueSignals } from "@/lib/business-app/cafe-queue/load.server";
import { cafeAlbumKey } from "@/lib/business-app/cafe-queue/rank";
import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { loadWorkspaceActor, loadWorkspaceCatalog } from "@/lib/business-workspace/load.server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Reorders the cabinet pool. Does not sign audio and does not add tracks. */
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
  if (body && typeof body === "object" && !Array.isArray(body) && !("seed" in body)) {
    body = { ...body, seed: Math.floor(Math.random() * 0x7fffffff) };
  }
  const actor = await loadWorkspaceActor(new URL(request.url).searchParams.get("space"));
  const result = await handleCafeQueue(body, {
    access: async () => (actor.ok && actor.playerOpen ? "open" : "closed"),
    loadTracks: async () => {
      if (!actor.ok || !actor.playerOpen) return null;
      const catalog = await loadWorkspaceCatalog({
        spaceId: actor.space.id,
        locationId: actor.locationId,
        spaceEnabled: actor.space.enabled,
      });
      if (catalog.unavailable) return null;
      return catalog.tracks.map((track) => ({
        audioItemId: track.audioItemId,
        albumKey: cafeAlbumKey(track),
      }));
    },
    loadSignals: (ids) => loadCafeQueueSignals(ids),
  });
  if (!result.ok && !actor.ok && actor.reason === "unavailable" && result.reason === "no_access") {
    return NextResponse.json({ ok: false, reason: "guest_unavailable" }, { status: 200, headers: NO_STORE });
  }
  const status = !result.ok && result.reason === "invalid_request" ? 400 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
