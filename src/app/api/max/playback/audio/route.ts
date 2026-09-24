import "server-only";

import { readMaxJsonPost } from "@/lib/max/authenticated-post";
import { signMaxPlaybackAudio } from "@/lib/max/playback";
import { verifyMaxPlaybackTicket } from "@/lib/max/playback-ticket";
import { resolveMaxNativeUser } from "@/lib/max/session-binding";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "@/lib/max/touch-external-identity";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setMaxPlaybackDepsForTests } from "@/lib/max/playback";
export { setMaxPlaybackTicketNowForTests } from "@/lib/max/playback-ticket";

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const parsed = await readMaxJsonPost(request);
    if (!parsed.ok) {
      return parsed.response;
    }

    if (typeof parsed.body.playbackTicket !== "string" || parsed.body.playbackTicket.trim() === "") {
      return fail("invalid_request", 400);
    }
    if (typeof parsed.body.trackId !== "string" || parsed.body.trackId.trim() === "") {
      return fail("invalid_request", 400);
    }

    const ticket = verifyMaxPlaybackTicket(parsed.body.playbackTicket);
    if (!ticket.ok) {
      if (ticket.reason === "malformed") return fail("invalid_request", 400);
      if (ticket.reason === "expired") return fail("playback_expired", 401);
      return fail("invalid_ticket", 401);
    }

    const native = await resolveMaxNativeUser(
      MAX_EXTERNAL_IDENTITY_PROVIDER,
      ticket.claims.providerUserId,
    );
    if (!native.ok) {
      return fail("storage_unavailable", 503);
    }
    if (!native.userId) {
      return fail("unlinked", 403);
    }

    const result = await signMaxPlaybackAudio(
      native.userId,
      ticket.claims.authorSlug,
      ticket.claims.productSlug,
      parsed.body.trackId.trim(),
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
  } catch {
    return fail("storage_unavailable", 503);
  }
}
