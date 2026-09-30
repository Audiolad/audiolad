import "server-only";

import { readMaxVerifiedPost } from "@/lib/max/authenticated-post";
import { getMaxPlaybackSession } from "@/lib/max/playback";
import { mintMaxPlaybackTicket } from "@/lib/max/playback-ticket";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";
export { setMaxPlaybackDepsForTests } from "@/lib/max/playback";
export { setMaxPlaybackTicketNowForTests } from "@/lib/max/playback-ticket";

const AUDIO_ITEM_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readOptionalAudioItemId(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value == null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (!AUDIO_ITEM_UUID.test(trimmed)) {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const verified = await readMaxVerifiedPost(request, [
      "authorSlug",
      "productSlug",
    ]);
    if (!verified.ok) {
      return verified.response;
    }

    const authorSlug = String(verified.body.authorSlug).trim();
    const productSlug = String(verified.body.productSlug).trim();
    const audioItemId = readOptionalAudioItemId(verified.body.audioItemId);
    if (!audioItemId.ok) {
      return fail("invalid_request", 400);
    }
    const result = await getMaxPlaybackSession(
      verified.userId,
      authorSlug,
      productSlug,
      undefined,
      audioItemId.value,
    );

    if (!result.ok) {
      if (result.reason === "not_found") return fail("not_found", 404);
      if (result.reason === "access_required") return fail("access_required", 403);
      if (result.reason === "preview_unavailable") return fail("preview_unavailable", 403);
      if (result.reason === "no_audio") return fail("no_audio", 404);
      return fail("storage_unavailable", 503);
    }

    const ticket = mintMaxPlaybackTicket({
      providerUserId: verified.providerUserId,
      authorSlug,
      productSlug,
    });

    return Response.json(
      {
        ok: true,
        playbackMode: result.playbackMode,
        session: result.session,
        playbackTicket: ticket.token,
        playbackTicketExpiresIn: ticket.expiresIn,
        ...(result.playbackMode === "preview"
          ? { previewDurationSeconds: result.previewDurationSeconds }
          : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return fail("storage_unavailable", 503);
  }
}
