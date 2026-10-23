import { NextResponse } from "next/server";

import { isSameOriginJsonRequest } from "@/lib/business-app/spa-player-report";
import { loadWorkspaceActor, loadWorkspaceAllowedIds } from "@/lib/business-workspace/load.server";
import { handleWorkspaceTrackUrl } from "@/lib/business-workspace/routes";
import { signWorkspaceAudio } from "@/lib/business-workspace/sign.server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Signed stream URL for an admitted, ELIGIBLE workspace track. Closed when the gift has ended. */
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
  if (!actor.ok) {
    return NextResponse.json(
      { ok: false, reason: actor.reason === "unavailable" ? "guest_unavailable" : "no_access" },
      { status: 200, headers: NO_STORE },
    );
  }
  const allowed = await loadWorkspaceAllowedIds({
    spaceId: actor.space.id,
    locationId: actor.locationId,
    spaceEnabled: actor.space.enabled,
  });
  if (!allowed) {
    return NextResponse.json({ ok: false, reason: "guest_unavailable" }, { status: 200, headers: NO_STORE });
  }
  const result = await handleWorkspaceTrackUrl(body, {
    access: async () => (actor.playerOpen ? "open" : "closed"),
    allowedIds: async () => allowed,
    sign: (audioItemId) => signWorkspaceAudio(audioItemId, new Set(allowed)),
  });
  const status = !result.ok && result.reason === "invalid_request" ? 400 : 200;
  return NextResponse.json(result, { status, headers: NO_STORE });
}
