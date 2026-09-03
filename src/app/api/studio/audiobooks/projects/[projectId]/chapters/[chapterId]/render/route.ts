import { NextResponse } from "next/server";
import { AuthorAccessError } from "@/lib/author-products/auth";
import { AudiobookError, createAudiobookChapterRenderJob, getAudiobookChapterRenderState, parseAudiobookUuid } from "@/lib/audiobooks/server";

type Context = { params: Promise<{ projectId: string; chapterId: string }> };
function respond(error: unknown) {
  if (error instanceof AudiobookError || error instanceof AuthorAccessError) return NextResponse.json({ error: error.code }, { status: error.status });
  console.error("audiobook_chapter_render_route_error", { error });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
export async function GET(request: Request, context: Context) {
  try {
    const { projectId, chapterId } = await context.params;
    const authorId = parseAudiobookUuid(new URL(request.url).searchParams.get("authorId"), "invalid_author_id");
    return NextResponse.json({ job: await getAudiobookChapterRenderState(parseAudiobookUuid(projectId, "not_found"), parseAudiobookUuid(chapterId, "not_found"), authorId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return respond(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { projectId, chapterId } = await context.params;
    const body = await request.json();
    const job = await createAudiobookChapterRenderJob(parseAudiobookUuid(projectId, "not_found"), parseAudiobookUuid(chapterId, "not_found"), parseAudiobookUuid(body?.authorId, "invalid_author_id"));
    return NextResponse.json({ job }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return respond(error); }
}
