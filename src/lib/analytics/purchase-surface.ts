export const PURCHASE_SURFACES = [
  "practice_page",
  "preview",
  "catalog_card",
  "playlist",
  "author_page",
  "quick_offer",
  "sales_landing",
  "unknown",
] as const;

export type PurchaseSurface = (typeof PURCHASE_SURFACES)[number];

const SURFACE_SET = new Set<string>(PURCHASE_SURFACES);

export function isPurchaseSurface(value: string): value is PurchaseSurface {
  return SURFACE_SET.has(value);
}

export function normalizePurchaseSurface(
  value: string | null | undefined,
): PurchaseSurface {
  if (typeof value !== "string") {
    return "unknown";
  }

  const trimmed = value.trim();
  return isPurchaseSurface(trimmed) ? trimmed : "unknown";
}
