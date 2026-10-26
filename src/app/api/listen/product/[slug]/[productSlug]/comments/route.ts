import { parseCommentPageQuery } from "@/lib/practice-comments/pagination";
import { listPracticeComments, createImpression } from "@/lib/practice-comments/service";
import {
  COMMENT_RESPONSE_HEADERS,
  commentActor,
  commentClock,
  commentStore,
  readJsonBody,
  requestIdFrom,
  runCommentAction,
} from "@/lib/practice-comments/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string; productSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { slug, productSlug } = await context.params;
  const page = parseCommentPageQuery(new URL(request.url).searchParams);
  if (!page) {
    return Response.json(
      { error: "invalid_page" },
      { status: 400, headers: COMMENT_RESPONSE_HEADERS },
    );
  }
  return runCommentAction(async () =>
    listPracticeComments(await commentStore(request), await commentActor(request), {
      authorSlug: slug,
      productSlug,
      ...page,
    }),
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { slug, productSlug } = await context.params;
  const body = await readJsonBody(request);
  return runCommentAction(async () =>
    createImpression(await commentStore(request), await commentActor(request), commentClock(), {
      authorSlug: slug,
      productSlug,
      body: body.body,
      publicName: body.publicName,
      clientRequestId: requestIdFrom(request, body),
    }),
  );
}
