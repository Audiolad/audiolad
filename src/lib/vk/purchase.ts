import { buildPracticePublicPath } from "@/lib/products/paths";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { openVkExternalHttps } from "@/lib/vk/bridge";
import { readVkSlug } from "@/lib/vk/request";

/**
 * Canonical public product page. Checkout, auth, and entitlement stay there.
 * VK only opens this HTTPS URL; it does not create an order.
 */
export function vkCanonicalPracticeUrl(
  authorSlug: string,
  productSlug: string,
): string | null {
  const author = readVkSlug(authorSlug);
  const product = readVkSlug(productSlug);
  if (!author || !product) return null;

  const url = new URL(buildPracticePublicPath(author, product), `${PRODUCTION_APP_ORIGIN}/`);
  if (
    url.origin !== PRODUCTION_APP_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return url.toString();
}

export function openVkCanonicalPracticePage(
  authorSlug: string,
  productSlug: string,
): boolean {
  const url = vkCanonicalPracticeUrl(authorSlug, productSlug);
  if (!url) return false;
  return openVkExternalHttps(url);
}

/** Display label for a positive ruble price already formatted by the server. */
export function vkBuyCtaLabel(priceLabel: string): string | null {
  const label = priceLabel.trim();
  const compact = label.replace(/[\s\u00A0]/g, "");
  if (!/^[1-9]\d*₽$/.test(compact)) return null;
  return `Купить за ${label}`;
}

/**
 * Paid offer shown in VK. Free products and incomplete prices do not invent a buy CTA.
 * Preview playback is decided separately and must stay available.
 */
export function vkProductCommerce(product: {
  isFree: boolean;
  priceLabel: string;
}): { priceLabel: string | null; buyLabel: string | null } {
  if (product.isFree) return { priceLabel: null, buyLabel: null };
  const priceLabel = product.priceLabel.trim();
  if (!priceLabel) return { priceLabel: null, buyLabel: null };
  return { priceLabel, buyLabel: vkBuyCtaLabel(priceLabel) };
}
