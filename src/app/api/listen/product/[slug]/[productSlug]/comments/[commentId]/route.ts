import { deleteOwnComment, updateOwnComment } from "@/lib/practice-comments/service";
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

export async function PATCH(request: Request, context: RouteContext) {
  const { commentId } = await context.params;
  const body = await readJsonBody(request);
  return runCommentAction(async () =>
    updateOwnComment(await commentStore(request), await commentActor(request), commentClock(), {
      commentId,
      body: body.body,
      publicName: body.publicName,
    }),
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  const { commentId } = await context.params;
  return runCommentAction(async () =>
    deleteOwnComment(
      await commentStore(request),
      await commentActor(request),
      commentClock(),
      commentId,
    ),
  );
}
