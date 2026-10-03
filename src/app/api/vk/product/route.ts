import "server-only";

import { loadVkPublishedProduct } from "@/lib/vk/product";
import { readVkJsonPost, readVkTarget, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";
export { setPublishedProductLookupForTests } from "@/lib/mini-app/published-product-target";
export { setGetMaxPublishedProductForTests } from "@/lib/max/product";

export async function POST(request: Request) {
  try {
    const parsed = await readVkJsonPost(request);
    if (!parsed.ok) return parsed.response;

    const target = readVkTarget(parsed.body);
    if (!target) return vkFail("invalid_request", 400);

    const result = await loadVkPublishedProduct(target);
    if (!result.ok) return vkFail("storage_unavailable", 503);
    if (!result.product) return vkFail("not_found", 404);
    return vkJson({ ok: true, product: result.product });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
}
