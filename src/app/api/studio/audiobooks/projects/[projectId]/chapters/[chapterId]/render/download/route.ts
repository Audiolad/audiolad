import { AuthorAccessError } from "@/lib/author-products/auth";
import { AudiobookError, downloadAudiobookChapterRender, parseAudiobookUuid } from "@/lib/audiobooks/server";

type Context = { params: Promise<{ projectId: string; chapterId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { projectId, chapterId } = await context.params;
    const result = await downloadAudiobookChapterRender(
      parseAudiobookUuid(projectId, "not_found"), parseAudiobookUuid(chapterId, "not_found"),
      parseAudiobookUuid(new URL(request.url).searchParams.get("authorId"), "invalid_author_id"),
    );
    return new Response(result.data.stream(), { headers: {
      "Content-Type": "audio/mpeg", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof AudiobookError || error instanceof AuthorAccessError) return Response.json({ error: error.code }, { status: error.status });
    console.error("audiobook_chapter_render_download_error", { error });
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
