import "server-only";

import {
  loadVkGuestPlaylistCatalog,
  parseVkPlaylistCatalogBody,
} from "@/lib/vk/playlists";
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

    const query = parseVkPlaylistCatalogBody(parsed.body);
    if (!query.ok) return vkFail("invalid_request", 400);

    const catalog = await loadVkGuestPlaylistCatalog(query.query);
    if (!catalog.ok) return vkFail("storage_unavailable", 503);
    return vkJson({
      ok: true,
      items: catalog.items,
      nextCursor: catalog.nextCursor,
    });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
