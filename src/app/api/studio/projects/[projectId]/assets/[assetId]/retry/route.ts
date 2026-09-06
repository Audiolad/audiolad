import { NextResponse } from "next/server";

import { retryStudioDirectUpload } from "@/lib/studio/server/direct-upload";
import { toStudioAssetDto } from "@/lib/studio/server/model";
import { parseUuid } from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";

type RouteContext = { params: Promise<{ projectId: string; assetId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { projectId: rawProjectId, assetId: rawAssetId } = await context.params;
    const projectId = parseUuid(rawProjectId, "not_found");
    const assetId = parseUuid(rawAssetId, "not_found");
    const reserved = await retryStudioDirectUpload(projectId, assetId);
    return NextResponse.json(
      {
        asset: toStudioAssetDto(reserved.asset),
        signedUpload: reserved.signedUpload,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return studioRouteError(error, "studio_project_asset_retry_error");
  }
}
