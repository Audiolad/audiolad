import { NextResponse } from "next/server";

import { createStudioAssetPlaybackUrl } from "@/lib/studio/server/signed-playback";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { parseUuid } from "@/lib/studio/server/validation";

type RouteContext = {
  params: Promise<{ projectId: string; assetId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId: rawProjectId, assetId: rawAssetId } = await context.params;
    const projectId = parseUuid(rawProjectId, "not_found");
    const assetId = parseUuid(rawAssetId, "not_found");
    const playback = await createStudioAssetPlaybackUrl(projectId, assetId);
    return NextResponse.json(playback, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    return studioRouteError(error, "studio_project_asset_playback_route_error");
  }
}
