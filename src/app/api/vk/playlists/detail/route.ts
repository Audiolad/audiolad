import "server-only";

import { loadVkGuestPlaylistDetail, readVkPlaylistSlug } from "@/lib/vk/playlists";
import { readVkJsonPost, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";

export {
  setListMaxPublicPlaylistsForTests,
  setLoadMaxPublicPlaylistForTests,
} from "@/lib/max/playlists";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const slug = readVkPlaylistSlug(parsed.body.slug);
    if (!slug) return vkFail("invalid_request", 400);

    const loaded = await loadVkGuestPlaylistDetail(slug);
    if (!loaded.ok) {
      if (loaded.reason === "not_found") return vkFail("not_found", 404);
      return vkFail("storage_unavailable", 503);
    }

    return vkJson({ ok: true, detail: loaded.detail });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
