import { moderateComment } from "@/lib/practice-comments/service";
import {
  commentClock,
  commentModerator,
  commentStore,
  readJsonBody,
  runCommentAction,
} from "@/lib/practice-comments/server";

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const moderator = await commentModerator(request);
  if (!moderator.ok) return moderator.response;
  const { commentId } = await context.params;
  const body = await readJsonBody(request);
  return runCommentAction(async () =>
    moderateComment(await commentStore(request), moderator.actor, commentClock(), {
      commentId,
      action: "restore",
      reason: body.reason,
    }),
  );
}
