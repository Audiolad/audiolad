import { NextResponse } from "next/server";

import { handleAuthorRouteError } from "@/lib/author-products/auth";
import { readAuthorSignedUploadClientReport } from "@/lib/author-products/signed-upload-client";
import {
  ProductAudioUploadError,
  abandonProductAudioDirectUpload,
} from "@/lib/author-products/server/direct-audio-upload";

type RouteContext = {
  params: Promise<{ id: string; audioId: string }>;
};

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
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

    const storageError = readAuthorSignedUploadClientReport(body.storageError);
    if (storageError) {
      console.error("author product-audio browser upload rejected", {
        practiceId: id,
        audioId,
        code: storageError.code,
        status: storageError.status,
        statusCode: storageError.statusCode,
        message: storageError.message,
      });
    }

    await abandonProductAudioDirectUpload({
      practiceId: id,
      audioId,
      uploadPath: readString(body.upload_path ?? body.uploadPath),
    });

    return NextResponse.json({ ok: true });
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
