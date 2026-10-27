import { replyAsAuthor } from "@/lib/practice-comments/service";
import {
  commentActor,
  commentClock,
  commentStore,
  readJsonBody,
  requestIdFrom,
  runCommentAction,
} from "@/lib/practice-comments/server";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string; commentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { slug, productSlug, commentId } = await context.params;
  const body = await readJsonBody(request);
  return runCommentAction(async () =>
    replyAsAuthor(await commentStore(request), await commentActor(request), commentClock(), {
      commentId,
      authorSlug: slug,
      productSlug,
      body: body.body,
      clientRequestId: requestIdFrom(request, body),
    }),
  );
}
