import { parseCommentPageQuery } from "@/lib/practice-comments/pagination";
import { listAuthorFeedback, markCommentNoticeRead } from "@/lib/practice-comments/service";
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
  const authorId = url.searchParams.get("authorId");
  return runCommentAction(async () =>
    listAuthorFeedback(await commentStore(request), await commentActor(request), {
      authorId: authorId || null,
      ...page,
    }),
  );
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const noticeId = typeof body.noticeId === "string" ? body.noticeId : "";
  if (!noticeId) return Response.json({ error: "invalid_notice" }, { status: 400 });
  return runCommentAction(async () =>
    markCommentNoticeRead(
      await commentStore(request),
      await commentActor(request),
      commentClock(),
      noticeId,
    ),
  );
}
