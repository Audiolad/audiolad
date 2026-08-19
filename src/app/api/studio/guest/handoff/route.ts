import { NextResponse } from "next/server";

import { createStudioGuestHandoffUrl } from "@/lib/studio/server/guest-handoff";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { parseUuid, StudioApiError } from "@/lib/studio/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as { projectId?: unknown }).projectId !== "string"
    ) {
      throw new StudioApiError("invalid_request", 422);
    }
    const projectId = parseUuid(
      (body as { projectId: string }).projectId,
      "invalid_project",
    );
    const url = await createStudioGuestHandoffUrl({ projectId, request });
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    return studioRouteError(error, "studio_guest_handoff_route_error");
  }
}
