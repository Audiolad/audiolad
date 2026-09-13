import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  MusicMasterUploadError,
  startMusicMasterDirectUpload,
} from "@/lib/author-products/server/music-master-upload";

type RouteContext = { params: Promise<{ id: string; audioId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { id, audioId } = await context.params;
    const started = await startMusicMasterDirectUpload({
      practiceId: id,
      audioId,
      fileName: typeof body.file_name === "string" ? body.file_name : "",
      fileSize: typeof body.file_size === "number" ? body.file_size : Number(body.file_size),
      mimeType: typeof body.mime_type === "string" ? body.mime_type : "",
    });
    return NextResponse.json(started);
  } catch (error) {
    if (error instanceof MusicMasterUploadError) {
      return NextResponse.json(
        { error: error.code, ...(error.userMessage ? { message: error.userMessage } : {}) },
        { status: error.status },
      );
    }
    return handleAuthorRouteError(error);
  }
}
