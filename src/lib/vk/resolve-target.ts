import "server-only";

import {
  resolvePublishedListedProductById,
  resolvePublishedListedProductBySlug,
  type PublishedProductLookupResult,
} from "@/lib/mini-app/published-product-target";
import { parseProductStartPayload } from "@/lib/mini-app/product-target";
import {
  parseVkLaunchToken,
  VK_SMOKE_AUTHOR_SLUG,
  VK_SMOKE_PRODUCT_SLUG,
} from "@/lib/vk/launch-target";

/** Resolve a VK launch token to a published listed product, or fail closed. */
export async function resolveVkLaunchTarget(
  token: string | null | undefined,
): Promise<PublishedProductLookupResult> {
  const parsed = parseVkLaunchToken(token);
  if (!parsed) return { ok: true, target: null };

  if (parsed.kind === "smoke") {
    return resolvePublishedListedProductBySlug(
      VK_SMOKE_AUTHOR_SLUG,
      VK_SMOKE_PRODUCT_SLUG,
    );
  }

  const product = parseProductStartPayload(parsed.payload);
  if (!product) return { ok: true, target: null };
  return resolvePublishedListedProductById(product.practiceId);
}
