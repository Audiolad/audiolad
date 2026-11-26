import "server-only";

import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import { writeMaxPracticeListenStats } from "@/lib/max/listen-stats";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setMaxListenStatsDepsForTests } from "@/lib/max/listen-stats";

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
    "audioItemId",
  ]);
  if (!authenticated.ok) return authenticated.response;

  const authorSlug = String(authenticated.body.authorSlug).trim();
  const productSlug = String(authenticated.body.productSlug).trim();
  const result = await writeMaxPracticeListenStats({
    userId: authenticated.userId,
    authorSlug,
    productSlug,
    audioItemId: authenticated.body.audioItemId,
    positionMs: authenticated.body.positionMs,
    priorPositionMs: authenticated.body.priorPositionMs,
    mediaDeltaMs: authenticated.body.mediaDeltaMs,
    playbackRate: authenticated.body.playbackRate,
  });

  if (!result.ok) return fail(result.reason, result.status);
  return Response.json(
    { ok: true, ...result.body },
    { status: result.status, headers: { "Cache-Control": "no-store" } },
  );
}