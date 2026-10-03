import "server-only";

import { loadVkPlaybackSession } from "@/lib/vk/playback";
import { readVkJsonPost, readVkTarget, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";
export { setVkPlaybackDepsForTests } from "@/lib/vk/playback";
export { setPublishedProductLookupForTests } from "@/lib/mini-app/published-product-target";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const target = readVkTarget(parsed.body);
    if (!target) return vkFail("invalid_request", 400);

    const result = await loadVkPlaybackSession(target);
    if (!result.ok) {
      if (result.reason === "not_found") return vkFail("not_found", 404);
      if (result.reason === "access_required") return vkFail("access_required", 403);
      if (result.reason === "preview_unavailable") return vkFail("preview_unavailable", 403);
      if (result.reason === "no_audio") return vkFail("no_audio", 404);
      return vkFail("storage_unavailable", 503);
    }

    return vkJson({
      ok: true,
      playbackMode: result.playbackMode,
      session: result.session,
      ...(result.playbackMode === "preview"
        ? { previewDurationSeconds: result.previewDurationSeconds }
        : {}),
    });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
