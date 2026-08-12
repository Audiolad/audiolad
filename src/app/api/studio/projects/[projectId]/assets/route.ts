import { NextResponse } from "next/server";

import {
  cleanupStudioAssetReservation,
  listStudioAssets,
  reserveStudioAssetUpload,
  uploadReservedStudioAsset,
} from "@/lib/studio/server/repository";
import { toStudioAssetDto } from "@/lib/studio/server/model";
import {
  parseUuid,
  parseStudioSourceType,
  StudioApiError,
  validateStudioUpload,
} from "@/lib/studio/server/validation";
import { studioRouteError } from "@/lib/studio/server/route-errors";
import { probeStudioAudioDuration } from "@/lib/studio/server/audio-duration";

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
    return noStoreJson({ assets: assets.map(toStudioAssetDto) });
  } catch (error) {
    return await handleError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new StudioApiError("invalid_file", 422);
    }

    const projectId = parseUuid((await context.params).projectId, "not_found");
    const upload = validateStudioUpload(file);
    const durationSeconds = await probeStudioAudioDuration(file, upload.mimeType);
    if (durationSeconds === null) {
      throw new StudioApiError("invalid_audio_duration", 422);
    }
    const reserved = await reserveStudioAssetUpload({
      projectId,
      ...upload,
      sourceType: parseStudioSourceType(formData.get("sourceType")),
      durationSeconds,
    });

    try {
      const pathParts = reserved.storage_path.split("/");
      await uploadReservedStudioAsset(reserved, pathParts[1] ?? "", file);
    } catch (error) {
      await cleanupStudioAssetReservation(reserved);
      throw error;
    }

    return noStoreJson({ asset: toStudioAssetDto(reserved) }, { status: 201 });
  } catch (error) {
    return await handleError(error);
  }
}
