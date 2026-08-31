import { NextResponse } from "next/server";

import { AuthorAccessError } from "@/lib/author-products/auth";
import {
  AudiobookError,
  deleteAudiobookFragment,
  parseAudiobookUuid,
} from "@/lib/audiobooks/server";

type Context = {
  params: Promise<{ projectId: string; chapterId: string; fragmentId: string }>;
};

function respond(error: unknown) {
  if (error instanceof AudiobookError || error instanceof AuthorAccessError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  console.error("audiobook_fragment_route_error", { error });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { projectId, chapterId, fragmentId } = await context.params;
    const authorId = parseAudiobookUuid(new URL(request.url).searchParams.get("authorId"), "invalid_author_id");
    await deleteAudiobookFragment(
      parseAudiobookUuid(projectId, "not_found"),
      parseAudiobookUuid(chapterId, "not_found"),
      parseAudiobookUuid(fragmentId, "not_found"),
      authorId,
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return respond(error);
  }
}
