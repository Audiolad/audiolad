import "server-only";

import { readMaxVerifiedPost } from "@/lib/max/authenticated-post";
import { getMaxPublishedProduct } from "@/lib/max/product";

export const dynamic = "force-dynamic";
export { setGetMaxPublishedProductForTests } from "@/lib/max/product";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const verified = await readMaxVerifiedPost(request, ["authorSlug", "productSlug"]);
  if (!verified.ok) return verified.response;

  const result = await getMaxPublishedProduct(
    String(verified.body.authorSlug),
    String(verified.body.productSlug),
    verified.userId,
  );
  if (!result.ok) return fail("storage_unavailable", 503);
  if (!result.product) return fail("not_found", 404);
  return Response.json(
    { ok: true, product: result.product },
    { headers: { "Cache-Control": "no-store" } },
  );
}
