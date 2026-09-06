import { NextResponse } from "next/server";

import { reserveStudioDirectUpload } from "@/lib/studio/server/direct-upload";
import { listStudioAssets } from "@/lib/studio/server/repository";
import { toStudioAssetDto } from "@/lib/studio/server/model";
import {
  parseUuid,
  parseStudioSourceType,
  StudioApiError,
  validateStudioUploadMeta,
} from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";

type RouteContext = { params: Promise<{ projectId: string }> };

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return NextResponse.json(body, { ...init, headers });
}

async function handleError(error: unknown) {
  const response = studioRouteError(error, "studio_assets_route_error");
  return noStoreJson(await response.json(), { status: response.status });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const projectId = parseUuid((await context.params).projectId, "not_found");
    const assets = await listStudioAssets(projectId);
    return noStoreJson({ assets: assets.map((asset) => toStudioAssetDto(asset)) });
  } catch (error) {
    return await handleError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      throw new StudioApiError("invalid_upload", 422);
    }
    const body = await request.json();
    const projectId = parseUuid((await context.params).projectId, "not_found");
    const upload = validateStudioUploadMeta({
      name: body?.originalName ?? body?.filename ?? body?.name,
      type: body?.mimeType ?? body?.type,
      size: body?.sizeBytes ?? body?.byteSize ?? body?.size,
    });
    const reserved = await reserveStudioDirectUpload({
      projectId,
      ...upload,
      sourceType: parseStudioSourceType(body?.sourceType),
    });
    return noStoreJson(
      {
        asset: toStudioAssetDto(reserved.asset),
        signedUpload: reserved.signedUpload,
      },
      { status: 201 },
    );
  } catch (error) {
    return await handleError(error);
  }
}
