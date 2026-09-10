import { NextResponse } from "next/server";

import { attachStudioCatalogAsset } from "@/lib/studio/server/catalog-assets";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { parseUuid, StudioApiError } from "@/lib/studio/server/validation";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const projectId = parseUuid((await context.params).projectId, "not_found");
    const body = (await request.json().catch(() => null)) as {
      practiceId?: unknown;
      audioItemId?: unknown;
    } | null;
    const practiceId = parseUuid(body?.practiceId, "invalid_request");
    const audioItemId = parseUuid(body?.audioItemId, "invalid_request");
    if (
      body &&
      typeof body === "object" &&
      ("storage_path" in body ||
        "storagePath" in body ||
        "audio_path" in body ||
        "url" in body ||
        "price" in body ||
        "authorId" in body)
    ) {
      throw new StudioApiError("invalid_request", 400);
    }
    const asset = await attachStudioCatalogAsset({
      projectId,
      practiceId,
      audioItemId,
    });
    return NextResponse.json(
      { asset },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    return studioRouteError(error, "studio_catalog_attach_route_error");
  }
}
