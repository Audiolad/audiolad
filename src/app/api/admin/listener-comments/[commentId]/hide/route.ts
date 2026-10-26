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

async function moderate(request: Request, context: RouteContext, action: "hide" | "restore") {
  const moderator = await commentModerator(request);
  if (!moderator.ok) return moderator.response;
  const { commentId } = await context.params;
  const body = await readJsonBody(request);
  return runCommentAction(async () =>
    moderateComment(await commentStore(request), moderator.actor, commentClock(), {
      commentId,
      action,
      reason: body.reason,
    }),
  );
}

export async function POST(request: Request, context: RouteContext) {
  return moderate(request, context, "hide");
}
