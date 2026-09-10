import { proxyStudioCatalogAssetStream } from "@/lib/studio/server/catalog-assets";
import { getStudioProjectAsset } from "@/lib/studio/server/repository";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { parseUuid, StudioApiError } from "@/lib/studio/server/validation";

type RouteContext = {
  params: Promise<{ projectId: string; assetId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { projectId: rawProjectId, assetId: rawAssetId } = await context.params;
    const projectId = parseUuid(rawProjectId, "not_found");
    const assetId = parseUuid(rawAssetId, "not_found");
    const { asset } = await getStudioProjectAsset(projectId, assetId);
    if (asset.source_type !== "catalog") {
      throw new StudioApiError("not_found", 404);
    }
    return await proxyStudioCatalogAssetStream({
      projectId,
      asset,
      rangeHeader: request.headers.get("range"),
    });
  } catch (error) {
    return studioRouteError(error, "studio_catalog_stream_route_error");
  }
}
