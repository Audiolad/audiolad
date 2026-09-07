import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  ProductAudioUploadError,
  startProductAudioDirectUpload,
} from "@/lib/author-products/server/direct-audio-upload";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { id, audioId } = await context.params;
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const started = await startProductAudioDirectUpload({
      practiceId: id,
      audioId,
      fileName: readString(body.file_name ?? body.fileName),
      fileSize: readNumber(body.file_size ?? body.fileSize),
      mimeType: readString(body.mime_type ?? body.mimeType),
    });

    return NextResponse.json({
      upload_path: started.upload_path,
      signedUpload: started.signedUpload,
    });
  } catch (error) {
    if (error instanceof ProductAudioUploadError) {
      return NextResponse.json(
        {
          error: error.code,
          ...(error.userMessage ? { message: error.userMessage } : {}),
        },
        { status: error.status },
      );
    }

    return handleAuthorRouteError(error);
  }
}
