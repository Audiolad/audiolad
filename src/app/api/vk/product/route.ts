import "server-only";

import { loadVkPublishedProductRef } from "@/lib/vk/product";
import { readVkJsonPost, readVkProductRef, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";
export { setPublishedProductLookupForTests } from "@/lib/mini-app/published-product-target";
export { setGetMaxPublishedProductForTests } from "@/lib/max/product";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const ref = readVkProductRef(parsed.body);
    if (!ref) return vkFail("invalid_request", 400);

    const result = await loadVkPublishedProductRef(ref);
    if (!result.ok) return vkFail("storage_unavailable", 503);
    if (!result.product) return vkFail("not_found", 404);
    return vkJson({ ok: true, product: result.product });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
