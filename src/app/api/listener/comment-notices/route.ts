import { listListenerNotices, markCommentNoticeRead } from "@/lib/practice-comments/service";
import {
  commentActor,
  commentClock,
  commentStore,
  readJsonBody,
  runCommentAction,
} from "@/lib/practice-comments/server";

export async function GET(request: Request) {
  return runCommentAction(async () =>
    listListenerNotices(await commentStore(request), await commentActor(request)),
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
