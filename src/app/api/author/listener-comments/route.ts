import { parseCommentPageQuery } from "@/lib/practice-comments/pagination";
import {
  listAuthorFeedback,
  markAuthorImpressionNotices,
  parseAuthorImpressionFilter,
} from "@/lib/practice-comments/service";
import {
  commentActor,
  commentClock,
  commentStore,
  readJsonBody,
  runCommentAction,
} from "@/lib/practice-comments/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = parseCommentPageQuery(url.searchParams);
  if (!page) return Response.json({ error: "invalid_page" }, { status: 400 });
  const filter = parseAuthorImpressionFilter(url.searchParams.get("filter"));
  if (!filter) return Response.json({ error: "invalid_filter" }, { status: 400 });
  const authorId = url.searchParams.get("authorId");
  return runCommentAction(async () =>
    listAuthorFeedback(await commentStore(request), await commentActor(request), {
      authorId: authorId || null,
      filter,
      ...page,
    }),
  );
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const noticeId = typeof body.noticeId === "string" ? body.noticeId : "";
  const noticeIds = Array.isArray(body.noticeIds)
    ? body.noticeIds.filter((id): id is string => typeof id === "string")
    : noticeId
      ? [noticeId]
      : [];
  const commentId = typeof body.commentId === "string" ? body.commentId : null;
  return runCommentAction(async () =>
    markAuthorImpressionNotices(
      await commentStore(request),
      await commentActor(request),
      commentClock(),
      { noticeIds, all: body.all === true, commentId },
    ),
  );
}
