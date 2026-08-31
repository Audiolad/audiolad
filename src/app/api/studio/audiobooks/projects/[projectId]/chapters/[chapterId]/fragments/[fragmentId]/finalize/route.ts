import { NextResponse } from "next/server";

import { AuthorAccessError } from "@/lib/author-products/auth";
import {
  AudiobookError,
  finalizeAudiobookFragment,
  parseAudiobookUuid,
} from "@/lib/audiobooks/server";

type Context = {
  params: Promise<{ projectId: string; chapterId: string; fragmentId: string }>;
};

function respond(error: unknown) {
  if (error instanceof AudiobookError || error instanceof AuthorAccessError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  console.error("audiobook_fragment_finalize_route_error", { error });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json();
    const { projectId, chapterId, fragmentId } = await context.params;
    const fragment = await finalizeAudiobookFragment(
      parseAudiobookUuid(projectId, "not_found"),
      parseAudiobookUuid(chapterId, "not_found"),
      parseAudiobookUuid(fragmentId, "not_found"),
      parseAudiobookUuid(body?.authorId, "invalid_author_id"),
    );
    return NextResponse.json({ fragment });
  } catch (error) {
    return respond(error);
  }
}
