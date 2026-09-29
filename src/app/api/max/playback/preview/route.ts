import "server-only";

import { readMaxJsonPost } from "@/lib/max/authenticated-post";
import { buildMaxPlaybackPreviewClip } from "@/lib/max/playback";
import { verifyMaxPlaybackTicket } from "@/lib/max/playback-ticket";

export const dynamic = "force-dynamic";
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

    const clip = await buildMaxPlaybackPreviewClip(
      ticket.claims.authorSlug,
      ticket.claims.productSlug,
      parsed.body.trackId.trim(),
    );

    if (!clip.ok) {
      if (clip.reason === "not_found") return fail("not_found", 404);
      if (clip.reason === "forbidden") return fail("forbidden", 403);
      if (clip.reason === "preview_unavailable") return fail("preview_unavailable", 403);
      return fail("storage_unavailable", 503);
    }

    return new Response(Buffer.from(clip.bytes), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return fail("storage_unavailable", 503);
  }
}
