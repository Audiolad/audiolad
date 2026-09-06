import { NextResponse } from "next/server";

import { reserveStudioDirectReplacement } from "@/lib/studio/server/direct-upload";
import {
  deleteStudioProjectAsset,
  downloadStudioProjectAsset,
} from "@/lib/studio/server/repository";
import { toStudioAssetDto } from "@/lib/studio/server/model";
import {
  parseUuid,
  sanitizeStudioFilename,
  StudioApiError,
  validateStudioUploadMeta,
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

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { projectId: rawProjectId, assetId: rawAssetId } = await context.params;
    const projectId = parseUuid(rawProjectId, "not_found");
    const assetId = parseUuid(rawAssetId, "not_found");
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      throw new StudioApiError("invalid_upload", 422);
    }
    const body = await request.json();
    const upload = validateStudioUploadMeta({
      name: body?.originalName ?? body?.filename ?? body?.name,
      type: body?.mimeType ?? body?.type,
      size: body?.sizeBytes ?? body?.byteSize ?? body?.size,
    });
    const reserved = await reserveStudioDirectReplacement({
      projectId,
      assetId,
      filename: upload.filename,
      mimeType: upload.mimeType,
      byteSize: upload.byteSize,
    });
    return NextResponse.json(
      {
        asset: toStudioAssetDto(reserved.asset),
        signedUpload: reserved.signedUpload,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return studioRouteError(error, "studio_project_asset_replace_error");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { projectId: rawProjectId, assetId: rawAssetId } = await context.params;
    const projectId = parseUuid(rawProjectId, "not_found");
    const assetId = parseUuid(rawAssetId, "not_found");
    await deleteStudioProjectAsset(projectId, assetId);
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return studioRouteError(error, "studio_project_asset_delete_error");
  }
}
