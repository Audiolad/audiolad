import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import {
  ProductAudioUploadError,
  finalizeProductAudioDirectUpload,
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

    const result = await finalizeProductAudioDirectUpload({
      practiceId: id,
      audioId,
      uploadPath: readString(body.upload_path ?? body.uploadPath),
      fileName: readString(body.file_name ?? body.fileName ?? body.name),
      fileSize: readNumber(
        body.file_size ?? body.fileSize ?? body.expected_size,
      ),
    });

    return NextResponse.json(result);
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
