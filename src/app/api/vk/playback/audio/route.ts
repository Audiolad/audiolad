import "server-only";

import { loadVkPlaybackAudioRef } from "@/lib/vk/playback";
import {
  readVkJsonPost,
  readVkProductRef,
  readVkTrackId,
  vkFail,
  vkJson,
} from "@/lib/vk/request";

export const dynamic = "force-dynamic";
export { setVkPlaybackDepsForTests } from "@/lib/vk/playback";
export { setPublishedProductLookupForTests } from "@/lib/mini-app/published-product-target";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const ref = readVkProductRef(parsed.body);
    const trackId = readVkTrackId(parsed.body.trackId);
    if (!ref || !trackId) return vkFail("invalid_request", 400);

    const result = await loadVkPlaybackAudioRef(ref, trackId);
    if (!result.ok) {
      if (result.reason === "not_found" || result.reason === "no_audio") {
        return vkFail(result.reason, 404);
      }
      if (
        result.reason === "access_required" ||
        result.reason === "preview_unavailable" ||
        result.reason === "forbidden"
      ) {
        return vkFail(result.reason, 403);
      }
      if (result.reason === "audio_missing") return vkFail("audio_missing", 404);
      if (result.reason === "sign_failed") return vkFail("sign_failed", 503);
      return vkFail("storage_unavailable", 503);
    }

    if (result.kind === "clip") {
      return new Response(Buffer.from(result.bytes), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return vkJson({ ok: true, url: result.url, expiresIn: result.expiresIn });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
