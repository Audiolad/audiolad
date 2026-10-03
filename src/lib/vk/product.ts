import "server-only";

import { getMaxPublishedProduct } from "@/lib/max/product";
import { toVkProductView, type VkProductView } from "@/lib/vk/product-view";
import type { VkProductRef } from "@/lib/vk/request";
import { resolveVkProductRef } from "@/lib/vk/resolve-target";

export type LoadVkProductResult =
  | { ok: true; product: VkProductView | null }
  | { ok: false; reason: "storage_unavailable" };

export async function loadVkPublishedProduct(
  token: string,
): Promise<LoadVkProductResult> {
  return loadVkPublishedProductRef({ kind: "token", token });
}

export async function loadVkPublishedProductRef(
  ref: VkProductRef,
): Promise<LoadVkProductResult> {
  const resolved = await resolveVkProductRef(ref);
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
