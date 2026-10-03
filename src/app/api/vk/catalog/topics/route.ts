import "server-only";

import { loadMaxCatalogTopics } from "@/lib/max/catalog-topics";
import { readVkJsonPost, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";
export { setListMaxCatalogTopicsForTests } from "@/lib/max/catalog-topics";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const topics = await loadMaxCatalogTopics();
    if (!topics.ok) return vkFail("storage_unavailable", 503);
    return vkJson({ ok: true, topics: topics.topics });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
