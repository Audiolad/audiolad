import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { readAuthorSignedUploadClientReport } from "@/lib/author-products/signed-upload-client";
import {
  MusicMasterUploadError,
  abandonMusicMasterDirectUpload,
} from "@/lib/author-products/server/music-master-upload";

type RouteContext = { params: Promise<{ id: string; audioId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { id, audioId } = await context.params;
    const storageError = readAuthorSignedUploadClientReport(body.storageError);
    if (storageError) {
      console.error("author music-master browser upload rejected", {
        practiceId: id,
        audioId,
        code: storageError.code,
        status: storageError.status,
        statusCode: storageError.statusCode,
        message: storageError.message,
      });
    }
    await abandonMusicMasterDirectUpload({
      practiceId: id,
      audioId,
      assetId: typeof body.asset_id === "string" ? body.asset_id : "",
      uploadPath: typeof body.upload_path === "string" ? body.upload_path : "",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MusicMasterUploadError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    return handleAuthorRouteError(error);
  }
}
