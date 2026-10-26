import { parseCommentPageQuery } from "@/lib/practice-comments/pagination";
import { listModerationQueue } from "@/lib/practice-comments/service";
import { commentModerator, commentStore, runCommentAction } from "@/lib/practice-comments/server";

export async function GET(request: Request) {
  const moderator = await commentModerator(request);
  if (!moderator.ok) return moderator.response;
  const url = new URL(request.url);
  const page = parseCommentPageQuery(url.searchParams);
  if (!page) return Response.json({ error: "invalid_page" }, { status: 400 });
  const queue = url.searchParams.get("queue") === "hidden" ? "hidden" : "reports";
  return runCommentAction(async () =>
    listModerationQueue(await commentStore(request), moderator.actor, {
      queue,
      cursor: page.cursor,
      limit: page.limit,
    }),
  );
}
