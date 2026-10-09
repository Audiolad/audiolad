import "server-only";

import { readMaxVerifiedPost } from "@/lib/max/authenticated-post";
import { getMaxPromoPage } from "@/lib/max/promo";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";

type GetMaxPromoPage = typeof getMaxPromoPage;
let getMaxPromoPageImpl: GetMaxPromoPage | null = null;

export function setGetMaxPromoPageForTests(impl: GetMaxPromoPage | null) {
  getMaxPromoPageImpl = impl;
}

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const verified = await readMaxVerifiedPost(request, [
    "authorSlug",
    "promoSlug",
  ]);
  if (!verified.ok) return verified.response;

  const authorSlug = String(verified.body.authorSlug).trim();
  const promoSlug = String(verified.body.promoSlug).trim();
  const result = await (getMaxPromoPageImpl ?? getMaxPromoPage)(authorSlug, promoSlug);

  if (!result.ok) {
    return fail(result.reason, result.reason === "not_found" ? 404 : 503);
  }

  return Response.json(
    { ok: true, page: result.page },
    { headers: { "Cache-Control": "no-store" } },
  );
}
