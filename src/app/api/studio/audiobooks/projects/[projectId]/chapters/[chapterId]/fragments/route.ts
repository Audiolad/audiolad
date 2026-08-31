import { NextResponse } from "next/server";

import { AuthorAccessError } from "@/lib/author-products/auth";
import {
  AudiobookError,
  listAudiobookFragments,
  parseAudiobookUuid,
  reserveAudiobookFragment,
} from "@/lib/audiobooks/server";

type Context = { params: Promise<{ projectId: string; chapterId: string }> };

function respond(error: unknown) {
  if (error instanceof AudiobookError || error instanceof AuthorAccessError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  console.error("audiobook_fragments_route_error", { error });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export async function GET(request: Request, context: Context) {
  try {
    const { projectId, chapterId } = await context.params;
    const authorId = parseAudiobookUuid(new URL(request.url).searchParams.get("authorId"), "invalid_author_id");
    const fragments = await listAudiobookFragments(
      parseAudiobookUuid(projectId, "not_found"),
      parseAudiobookUuid(chapterId, "not_found"),
      authorId,
    );
    return NextResponse.json({ fragments });
  } catch (error) {
    return respond(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json();
    const { projectId, chapterId } = await context.params;
    const result = await reserveAudiobookFragment({
      projectId: parseAudiobookUuid(projectId, "not_found"),
      chapterId: parseAudiobookUuid(chapterId, "not_found"),
      authorId: parseAudiobookUuid(body?.authorId, "invalid_author_id"),
      originalName: body?.originalName,
      mimeType: body?.mimeType,
      sizeBytes: body?.sizeBytes,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return respond(error);
  }
}
