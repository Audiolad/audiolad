import "server-only";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import { getMaxPlaybackSession } from "@/lib/max/playback";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setMaxPlaybackDepsForTests } from "@/lib/max/playback";

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
  if (!authenticated.ok) {
    return authenticated.response;
  }

  const authorSlug = String(authenticated.body.authorSlug).trim();
  const productSlug = String(authenticated.body.productSlug).trim();
  const result = await getMaxPlaybackSession(
    authenticated.userId,
    authorSlug,
    productSlug,
  );

  if (!result.ok) {
    if (result.reason === "not_found") return fail("not_found", 404);
    if (result.reason === "access_required") return fail("access_required", 403);
    if (result.reason === "no_audio") return fail("no_audio", 404);
    return fail("storage_unavailable", 503);
  }

  return Response.json(
    { ok: true, session: result.session },
    { headers: { "Cache-Control": "no-store" } },
  );
}
