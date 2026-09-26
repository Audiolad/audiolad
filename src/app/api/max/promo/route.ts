import "server-only";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import { getMaxPromoPage } from "@/lib/max/promo";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const authenticated = await readMaxAuthenticatedPost(request, [
    "authorSlug",
    "promoSlug",
  ]);
  if (!authenticated.ok) return authenticated.response;

  const authorSlug = String(authenticated.body.authorSlug).trim();
  const promoSlug = String(authenticated.body.promoSlug).trim();
  const result = await getMaxPromoPage(authorSlug, promoSlug);

  if (!result.ok) {
    return fail(result.reason, result.reason === "not_found" ? 404 : 503);
  }

  return Response.json(
    { ok: true, page: result.page },
    { headers: { "Cache-Control": "no-store" } },
  );
}
