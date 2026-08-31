import { NextResponse } from "next/server";
import { AuthorAccessError } from "@/lib/author-products/auth";
import { AudiobookError, createAudiobookProject, listAudiobookProjects, parseAudiobookTitle, parseAudiobookUuid } from "@/lib/audiobooks/server";

function errorResponse(error: unknown) {
  if (error instanceof AudiobookError || error instanceof AuthorAccessError) return NextResponse.json({ error: error.code }, { status: error.status });
  console.error("audiobook_projects_route_error", error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
export async function GET(request: Request) {
  try {
    const authorId = parseAudiobookUuid(new URL(request.url).searchParams.get("authorId"), "invalid_author_id");
    return NextResponse.json({ projects: await listAudiobookProjects(authorId) });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = await createAudiobookProject(parseAudiobookUuid(body?.authorId, "invalid_author_id"), parseAudiobookTitle(body?.title));
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
