import { reportComment } from "@/lib/practice-comments/service";
import {
  commentActor,
  commentClock,
  commentStore,
  readJsonBody,
  runCommentAction,
} from "@/lib/practice-comments/server";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string; commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { commentId } = await context.params;
  const body = await readJsonBody(request);
  return runCommentAction(async () =>
    reportComment(await commentStore(request), await commentActor(request), commentClock(), {
      commentId,
      reason: body.reason,
      details: body.details,
    }),
  );
}
