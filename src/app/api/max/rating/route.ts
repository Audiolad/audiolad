import "server-only";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import { readMaxPracticeRating, writeMaxPracticeRating } from "@/lib/max/rating";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setMaxRatingDepsForTests } from "@/lib/max/rating";

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const authenticated = await readMaxAuthenticatedPost(request, [
    "authorSlug",
    "productSlug",
  ]);
  if (!authenticated.ok) return authenticated.response;

  const authorSlug = String(authenticated.body.authorSlug).trim();
  const productSlug = String(authenticated.body.productSlug).trim();
  const hasStars = Object.prototype.hasOwnProperty.call(authenticated.body, "stars");
  const result = hasStars
    ? await writeMaxPracticeRating({
        request,
        userId: authenticated.userId,
        authorSlug,
        productSlug,
        stars: authenticated.body.stars,
      })
    : await readMaxPracticeRating({
        userId: authenticated.userId,
        authorSlug,
        productSlug,
      });

  if (!result.ok) return fail(result.reason, result.status);
  return Response.json(
    { ok: true, ...result.body },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}
