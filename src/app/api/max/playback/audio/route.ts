import "server-only";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import { signMaxPlaybackAudio } from "@/lib/max/playback";

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
    "trackId",
  ]);
  if (!authenticated.ok) {
    return authenticated.response;
  }

  const authorSlug = String(authenticated.body.authorSlug).trim();
  const productSlug = String(authenticated.body.productSlug).trim();
  const trackId = String(authenticated.body.trackId).trim();
  const result = await signMaxPlaybackAudio(
    authenticated.userId,
    authorSlug,
    productSlug,
    trackId,
  );

  if (!result.ok) {
    if (result.reason === "not_found") return fail("not_found", 404);
    if (result.reason === "access_required") return fail("access_required", 403);
    if (result.reason === "forbidden") return fail("forbidden", 403);
    if (result.reason === "audio_missing") return fail("audio_missing", 404);
    if (result.reason === "sign_failed") return fail("sign_failed", 503);
    return fail("storage_unavailable", 503);
  }

  return Response.json(
    { ok: true, url: result.url, expiresIn: result.expiresIn },
    { headers: { "Cache-Control": "no-store" } },
  );
}
