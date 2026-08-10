import { NextResponse } from "next/server";

import { downloadStudioProjectAsset } from "@/lib/studio/server/repository";
import {
  parseUuid,
  sanitizeStudioFilename,
} from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";

type RouteContext = {
  params: Promise<{ projectId: string; assetId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { projectId: rawProjectId, assetId: rawAssetId } = await context.params;
    const projectId = parseUuid(rawProjectId, "not_found");
    const assetId = parseUuid(rawAssetId, "not_found");
    const { asset, body } = await downloadStudioProjectAsset(projectId, assetId);
    const filename = sanitizeStudioFilename(asset.original_name);

    return new NextResponse(body.stream(), {
      headers: {
        "Content-Type": asset.mime_type,
        "Content-Length": String(asset.size_bytes),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = studioRouteError(error, "studio_project_asset_route_error");
    const body = await response.json();
    return NextResponse.json(body, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
