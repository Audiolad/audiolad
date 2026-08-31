import { NextResponse } from "next/server";
import { AuthorAccessError } from "@/lib/author-products/auth";
import { AudiobookError, deleteAudiobookProject, getAudiobookProject, parseAudiobookTitle, parseAudiobookUuid, renameAudiobookProject } from "@/lib/audiobooks/server";

type Context = { params: Promise<{ projectId: string }> };
function respond(error: unknown) {
  if (error instanceof AudiobookError || error instanceof AuthorAccessError) return NextResponse.json({ error: error.code }, { status: error.status });
  console.error("audiobook_project_route_error", error); return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
export async function GET(request: Request, context: Context) {
  try {
    const projectId = parseAudiobookUuid((await context.params).projectId, "not_found");
    const authorId = parseAudiobookUuid(new URL(request.url).searchParams.get("authorId"), "invalid_author_id");
    return NextResponse.json({ project: await getAudiobookProject(projectId, authorId) });
  } catch (error) { return respond(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const body = await request.json();
    const project = await renameAudiobookProject(parseAudiobookUuid((await context.params).projectId, "not_found"), parseAudiobookUuid(body?.authorId, "invalid_author_id"), parseAudiobookTitle(body?.title));
    return NextResponse.json({ project });
  } catch (error) { return respond(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const projectId = parseAudiobookUuid((await context.params).projectId, "not_found");
    const authorId = parseAudiobookUuid(new URL(request.url).searchParams.get("authorId"), "invalid_author_id");
    await deleteAudiobookProject(projectId, authorId); return new NextResponse(null, { status: 204 });
  } catch (error) { return respond(error); }
}
