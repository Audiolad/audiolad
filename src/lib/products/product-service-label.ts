import { isProductFree } from "@/lib/products/price-format";

/** Upper service line on product cards (format or gift label). */
export const PRODUCT_SERVICE_LINE_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]";

export function getProductServiceLineLabel(
  productTypeLabel: string,
  isFree: boolean | null | undefined,
  price?: number | null | undefined,
): string {
  if (isProductFree(isFree, price)) {
    return "ПОДАРОК";
  }

  return productTypeLabel;
}

/** Gift-only line for card layouts that show format elsewhere (playlists, history). */
export function getGiftProductServiceLineLabel(
  isFree: boolean | null | undefined,
  price?: number | null | undefined,
): string | null {
  return isProductFree(isFree, price) ? "ПОДАРОК" : null;
}
