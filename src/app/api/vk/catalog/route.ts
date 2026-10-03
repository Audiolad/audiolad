import "server-only";

import { loadVkGuestCatalog, parseVkCatalogBody } from "@/lib/vk/catalog";
import { readVkJsonPost, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";
export { setListMaxPublishedCatalogForTests } from "@/lib/max/catalog";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const query = parseVkCatalogBody(parsed.body);
    if (!query.ok) return vkFail("invalid_request", 400);

    const catalog = await loadVkGuestCatalog(query.input);
    if (!catalog.ok) return vkFail("storage_unavailable", 503);
    return vkJson({ ok: true, items: catalog.items });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
