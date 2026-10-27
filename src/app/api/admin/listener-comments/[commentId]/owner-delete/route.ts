import { deleteCommentAsOwner } from "@/lib/practice-comments/service";
import {
  commentClock,
  commentPlatformOwner,
  commentStore,
  runCommentAction,
} from "@/lib/practice-comments/server";

type RouteContext = {
  params: Promise<{ commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const owner = await commentPlatformOwner(request);
  if (!owner.ok) return owner.response;
  const { commentId } = await context.params;
  return runCommentAction(async () =>
    deleteCommentAsOwner(await commentStore(request), owner.actor, commentClock(), commentId),
  );
}
