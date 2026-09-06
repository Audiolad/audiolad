import { NextResponse } from "next/server";

import { finalizeStudioDirectReplacement } from "@/lib/studio/server/direct-upload";
import { toStudioAssetDto } from "@/lib/studio/server/model";
import { parseUuid } from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";

type RouteContext = { params: Promise<{ projectId: string; assetId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { projectId: rawProjectId, assetId: rawAssetId } = await context.params;
    const projectId = parseUuid(rawProjectId, "not_found");
    const assetId = parseUuid(rawAssetId, "not_found");
    const { asset, peaks } = await finalizeStudioDirectReplacement(projectId, assetId);
    return NextResponse.json(
      { asset: toStudioAssetDto(asset, peaks) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return studioRouteError(error, "studio_project_asset_replace_finalize_error");
  }
}
