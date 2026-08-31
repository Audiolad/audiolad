import { NextResponse } from "next/server";
import { AuthorAccessError } from "@/lib/author-products/auth";
import { AudiobookError, parseAudiobookUuid, reorderAudiobookChapters } from "@/lib/audiobooks/server";
type Context = { params: Promise<{ projectId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const body = await request.json();
    const chapters = await reorderAudiobookChapters(
      parseAudiobookUuid((await context.params).projectId, "not_found"),
      parseAudiobookUuid(body?.authorId, "invalid_author_id"),
      body?.chapterIds,
    );
    return NextResponse.json({ chapters });
  } catch (error) {
    if (error instanceof AudiobookError || error instanceof AuthorAccessError) return NextResponse.json({ error: error.code }, { status: error.status });
    console.error("audiobook_chapters_reorder_route_error", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
