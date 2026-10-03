import "server-only";

import { getMaxPublishedProduct } from "@/lib/max/product";
import { resolveVkLaunchTarget } from "@/lib/vk/resolve-target";
import { toVkProductView, type VkProductView } from "@/lib/vk/product-view";

export type LoadVkProductResult =
  | { ok: true; product: VkProductView | null }
  | { ok: false; reason: "storage_unavailable" };

export async function loadVkPublishedProduct(
  token: string,
): Promise<LoadVkProductResult> {
  const resolved = await resolveVkLaunchTarget(token);
  if (!resolved.ok) return { ok: false, reason: "storage_unavailable" };
  if (!resolved.target) return { ok: true, product: null };

  const loaded = await getMaxPublishedProduct(
    resolved.target.authorSlug,
    resolved.target.productSlug,
    null,
  );
  if (!loaded.ok) return { ok: false, reason: "storage_unavailable" };
  if (!loaded.product) return { ok: true, product: null };
  if (
    loaded.product.authorSlug !== resolved.target.authorSlug ||
    loaded.product.productSlug !== resolved.target.productSlug
  ) {
    return { ok: true, product: null };
  }

  return { ok: true, product: toVkProductView(loaded.product) };
}
