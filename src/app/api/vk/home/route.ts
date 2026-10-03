import "server-only";

import { loadVkGuestHomeShelves } from "@/lib/vk/home";
import { readVkJsonPost, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";
export { setListMaxPublishedCatalogForTests } from "@/lib/max/catalog";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const shelves = await loadVkGuestHomeShelves();
    if (!shelves.ok) return vkFail("storage_unavailable", 503);
    return vkJson({ ok: true, shelves: shelves.shelves });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
